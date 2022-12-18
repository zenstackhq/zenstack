try {
    if (process.env.DO_NOT_TRACK == '1') {
        process.exit(0);
    }

    const Mixpanel = require('mixpanel');
    const machineId = require('node-machine-id');
    const os = require('os');

    const mixpanel = Mixpanel.init('74944eb779d7d3b4ce185be843fde9fc', {
        geolocate: true,
    });

    const version = require('../package.json').version;
    const payload = {
        distinct_id: machineId.machineIdSync(),
        nodeVersion: process.version,
        time: new Date(),
        $os: os.platform(),
        version,
    };

    mixpanel.track('npm:install', payload);
} catch {}
