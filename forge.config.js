/* eslint-disable prettier/prettier */
module.exports = {
  outDir: 'forge-out',
  packagerConfig: {
    ignore: [
      /^\/src/,
      /^\/node_modules/,
      /^\/\.pnpm/,
      /pnpm-lock\.yaml/,
      /tsconfig\.json/
    ]
  },
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'idealauncher'
      }
    }
  ],

  publishers: [
    {
      name: '@electron-forge/publisher-github',
      config: {
        repository: {
          owner: 'idealproduct',
          name: 'IdeaLauncher'
        },
        prerelease: false,
        draft: false
      }
    }
  ]
};