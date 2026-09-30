@Library('releng-pipeline') _

if (env.BRANCH_NAME && env.BRANCH_NAME != 'main') {
  echo "Only main is published to ai.open-vsx.org; skipping ${env.BRANCH_NAME}"
  return
}

hugo (
  appName: 'ai.open-vsx.org',
  productionDomain: 'ai.open-vsx.org',
  build: [
    containerImage: 'eclipsefdn/hugo-node:h0.144.2-n22.14.0',
    script: 'build.sh',
    destinationFolder: 'website/dist'
  ],
  deployment: [
    nginxServerConf: 'config/nginx/default.conf'
  ],
)
