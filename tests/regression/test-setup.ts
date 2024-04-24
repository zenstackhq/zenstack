import {
    toBeNotFound,
    toBeRejectedByPolicy,
    toBeRejectedWithCode,
    toResolveFalsy,
    toResolveNull,
    toResolveTruthy,
} from '@zenstackhq/testtools/jest-ext';

expect.extend({
    toBeRejectedByPolicy,
    toBeNotFound,
    toResolveTruthy,
    toResolveFalsy,
    toResolveNull,
    toBeRejectedWithCode,
});
