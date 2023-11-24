try {
    if (process.env.DO_NOT_TRACK == '1') {
        process.exit(0);
    }

    const Mixpanel = require('mixpanel');
    const machineId = require('node-machine-id');
    const os = require('os');
    const isDocker = require('../utils/is-docker').default;

    const mixpanel = Mixpanel.init('<TELEMETRY_TRACKING_TOKEN>', {
        geolocate: true,
    });

    const version = require('../package.json').version;
    const payload = {
        distinct_id: machineId.machineIdSync(),
        nodeVersion: process.version,
        time: new Date(),
        $os: os.type(),
        osType: os.type(),
        osRelease: os.release(),
        osPlatform: os.platform(),
        osArch: os.arch(),
        osVersion: os.version(),
        isDocker: isDocker(),
        version,
    };

    mixpanel.track('npm:install', payload);
} catch {}
