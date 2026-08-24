function esinstall {
    yarn install --force --frozen-lockfile
}

function esbuild {
    yarn --cwd applications/electron build
}

function esrun {
    yarn electron start
}
