<template>
    <div>
        <div v-if="build.commit && build.commit.tag">
            <a target="_blank" :href="build.commit.url">
                <img src="../../../static/tag.svg">
                <md-tooltip>Tag</md-tooltip>
                <span v-if="showTitle">Tag</span>
            </a>
        </div>
        <div v-if="build.commit && !build.commit.tag && !build.pull_request">
            <a target="_blank" :href="build.commit.url">
                <img src="../../../static/git-commit.svg">
                <span v-if="showTitle">Commit</span>
                <md-tooltip>Commit</md-tooltip>
            </a>
        </div>
        <div v-if="build.pull_request">
            <a target="_blank" :href="build.pull_request.url">
                <img src="../../../static/git-pull-request.svg">
                <span v-if="showTitle">Pull request</span>
                <md-tooltip>Pull request</md-tooltip>
            </a>
        </div>
    </div>
</template>

<script>

export default {
    props: ['build', 'showTitle']
}
</script>
