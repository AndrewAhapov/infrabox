#pylint: disable=unused-argument
from flask import g, jsonify, abort, send_file
from flask_restplus import Resource, fields

from pyinfraboxutils import get_env
from pyinfraboxutils.ibflask import auth_required, check_job_belongs_to_project
from pyinfraboxutils.ibrestplus import api
from pyinfraboxutils.storage import storage

ns = api.namespace('api/v1/projects/<project_id>/jobs',
                   description='Job related operations',
                   tag="test")

limits_model = api.model('LimitsModel', {
    'cpu': fields.Integer(min=1, attribute='cpu'),
    'memory': fields.Integer(min=128, attribute='memory')
})

dependency_model = api.model('DependencyModel', {
    'on': fields.List(fields.String),
    'job': fields.String,
    'job-id': fields.String
})

resource_model = api.model('ResourceModel', {
    'limits': fields.Nested(limits_model)
})

job_model = api.model('JobModel', {
    'id': fields.String,
    'name': fields.String,
    'type': fields.String,
    'state': fields.String,
    'start_date': fields.DateTime,
    'end_date': fields.DateTime,
    'resources': fields.Nested(resource_model),
    'message': fields.String,
    'docker_file': fields.String,
    'depends_on': fields.Nested(dependency_model),
})

@ns.route('/<job_id>')
class Job(Resource):

    @auth_required(['project'])
    @ns.marshal_with(job_model)
    def get(self, project_id, job_id):
        job = g.db.execute_one_dict('''
            SELECT id, state, start_date, build_id, end_date, name,
                cpu, memory, build_arg, env_var, dockerfile as docker_file,
                dependencies as depends_on
            FROM job
            WHERE project_id = %s
            AND id = %s
        ''', [project_id, job_id])

        return job


@ns.route('/<job_id>/output')
class Output(Resource):

    @auth_required(['project'])
    @check_job_belongs_to_project
    def get(self, project_id, job_id):
        g.release_db()

        key = '%s.tar.gz' % job_id
        f = storage.download_output(key)

        if not f:
            abort(404)

        return send_file(f, attachment_filename=key)

@ns.route('/<job_id>/manifest')
class Project(Resource):

    @auth_required(['project'])
    @check_job_belongs_to_project
    def get(self, project_id, job_id):
        result = g.db.execute_one_dict('''
            SELECT j.name, j.start_date, j.end_date, j.cpu, memory, j.state, j.id, b.build_number, j.env_var, j.env_var_ref
            FROM job j
            JOIN build b
                ON b.id = j.build_id
                AND b.project_id = j.project_id
            WHERE j.id = %s
            AND j.project_id = %s
        ''', [job_id, project_id])

        m = {
            'name': result['name'],
            'start_date': result['start_date'],
            'end_date': result['end_date'],
            'cpu': result['cpu'],
            'memory': result['memory'],
            'state': result['state'],
            'id': result['id'],
            'build_number': result['build_number'],
            'environment': result['env_var'],
            'image': None,
            'output': None,
            'dependencies': []
        }

        # Image
        image = get_env('INFRABOX_DOCKER_REGISTRY_URL') + '/' + \
                project_id + '/' + \
                result['name'] + ':build_' + \
                str(result['build_number'])
        image = image.replace("https://", "")
        image = image.replace("http://", "")
        image = image.replace("//", "/")
        m['image'] = image

        # Output
        m['output'] = {
            'url': get_env('INFRABOX_ROOT_URL') + \
                   '/api/v1/projects/' + project_id + \
                   '/jobs/' + job_id + '/output',
            'format': 'tar.gz'
        }

        # Dependencies
        deps = g.db.execute_many_dict('''
             SELECT name, state, id FROM job
             WHERE id IN (SELECT (p->>'job-id')::uuid
                          FROM job, jsonb_array_elements(job.dependencies) as p
                          WHERE job.id = %s)
        ''', [job_id])

        for d in deps:
            d['output'] = {
                'url': get_env('INFRABOX_ROOT_URL') + \
                       '/api/v1/projects/' + project_id + \
                       '/jobs/' + d['id'] + '/output',
                'format': 'tar.gz'
            }

            m['dependencies'].append(d)

        return jsonify(m)
