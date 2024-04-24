import {
    toBeRejectedByPolicy,
    toBeNotFound,
    toResolveTruthy,
    toResolveFalsy,
    toResolveNull,
    toBeRejectedWithCode,
} from '@zenstackhq/testtools/jest-ext';

expect.extend({
    toBeRejectedByPolicy,
    toBeNotFound,
    toResolveTruthy,
    toResolveFalsy,
    toResolveNull,
    toBeRejectedWithCode,
});
