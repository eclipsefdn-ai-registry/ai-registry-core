@Library('releng-pipeline') _

hugo (
  appName: 'ai.open-vsx.org',
  productionDomain: 'ai.open-vsx.org',
  build: [
    containerImage: 'eclipsefdn/hugo-node:h0.144.2-n22.14.0',
    script: 'build.sh',
    destinationFolder: 'website/dist'
  ],
)
