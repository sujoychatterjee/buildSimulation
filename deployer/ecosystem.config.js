'use strict';

module.exports = {
  apps: [
    {
      name: 'simulation',
      interpreter: '/bin/bash',
      script: 'yarn',
      args: `http-server dist/ -p 8443`,
    },
  ],
};
