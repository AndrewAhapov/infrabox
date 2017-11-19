import Vue from 'vue'
import Vuex from 'vuex'
import events from './events'
import _ from 'underscore'

import Project from './models/Project'
import Build from './models/Build'
import Job from './models/Job'

Vue.use(Vuex)

const state = {
    user: null,
    projects: [],
    jobs: {},
    settings: {}
}

function findProject (state, projectId) {
    for (let p of state.projects) {
        if (p.id === projectId) {
            return p
        }
    }

    return null
}

function findBuild (project, buildId) {
    for (let b of project.builds) {
        if (b.id === buildId) {
            return b
        }
    }

    return null
}

function findCommit (project, commitId) {
    for (let c of project.commits) {
        if (c.id === commitId) {
            return c
        }
    }

    return null
}

function findJob (build, jobId) {
    for (let j of build.jobs) {
        if (j.id === jobId) {
            return j
        }
    }

    return null
}

function updateProjectState (project) {
    if (project.builds) {
        project.state = project.builds[0].state
    } else {
        project.state = 'finished'
    }
}

function handleJobUpdate (state, event) {
    const project = findProject(state, event.data.project.id)

    let commit = null

    if (project.isGit()) {
        // Update Commit
        findCommit(project, event.data.commit.id)
        if (event.data.commit) {
            if (!commit) {
                commit = event.data.commit
                project.commits.push(commit)
            }
        }
    }

    // Update Build
    let build = findBuild(project, event.data.build.id)
    if (!build) {
        build = new Build(event.data.build.id,
                          event.data.build.build_number,
                          event.data.build.restart_counter,
                          commit, event.data.pull_request,
                          project)

        let builds = [build]

        for (let b of project.builds) {
            builds.push(b)
        }

        builds = _(builds)
            .chain()
            .sortBy((b) => { return b.restartCounter })
            .sortBy((b) => { return b.number })
            .value()
            .reverse()

        project.builds = builds
    }

    // Update Job
    const job = findJob(build, event.data.job.id)
    const d = event.data.job

    let startDate = null
    let endDate = null

    if (d.start_date) {
        startDate = new Date(d.start_date)
    }

    if (d.end_data) {
        endDate = new Date(d.end_date)
    }

    if (!job) {
        const job = new Job(
            d.id,
            d.name,
            d.cpu,
            d.memory,
            d.state,
            startDate,
            endDate,
            build,
            project,
            d.dependencies
        )
        build.jobs.push(job)
        state.jobs[d.id] = job
    } else {
        job.state = d.state
        job.startDate = startDate
        job.endDate = endDate
    }

    build._updateState()
    updateProjectState(project)
}

function addProjects (state, projects) {
    for (const project of projects) {
        const p = findProject(state, project.id)
        if (p) {
            continue
        }

        state.projects.push(new Project(project.name, project.id, project.type))
        events.listenJobs(project)
    }
}

function addJobs (state, jobs) {
    for (const job of jobs) {
        handleJobUpdate(state, {
            type: 'INSERT',
            data: job
        })
    }
}

function setSecrets (state, data) {
    const project = data.project
    const secrets = data.secrets
    project.secrets = secrets
}

function setCollaborators (state, data) {
    const project = data.project
    const collaborators = data.collaborators
    project.collaborators = collaborators
}

function setTokens (state, data) {
    const project = data.project
    const tokens = data.tokens
    project.tokens = tokens
}

function setUser (state, user) {
    state.user = user
}

function setGithubRepos (state, repos) {
    state.user.githubRepos = repos
}

function setSettings (state, settings) {
    state.settings = settings
}

function setBadges (state, data) {
    const job = data.job
    const badges = data.badges
    job.badges = badges
}

function setEnvironment (state, data) {
    const job = data.job
    const env = data.env
    job.env = env
}

function handleConsoleUpdate (state, update) {
    const job = state.jobs[update.job_id]
    if (!job) {
        return
    }

    if (!update.data) {
        return
    }

    const lines = update.data.split('\n')
    job._addLines(lines)
}

function deleteProject (state, projectId) {
    let i = 0
    for (; i < state.projects.length; ++i) {
        const p = state.projects[i]
        if (p.id === projectId) {
            state.projects.splice(i, 1)
            break
        }
    }
}

const mutations = {
    addProjects,
    addJobs,
    setSecrets,
    setCollaborators,
    setTokens,
    handleJobUpdate,
    setUser,
    setGithubRepos,
    handleConsoleUpdate,
    deleteProject,
    setSettings,
    setBadges,
    setEnvironment
}

const getters = {}
const actions = {}

const store = new Vuex.Store({
    state,
    actions,
    mutations,
    getters
})

events.$on('NOTIFY_JOBS', (update) => {
    store.commit('handleJobUpdate', update)
})

events.$on('NOTIFY_CONSOLE', (update) => {
    store.commit('handleConsoleUpdate', update)
})

export default store