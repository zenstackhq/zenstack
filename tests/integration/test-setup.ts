import { toBeRejectedByPolicy, toBeNotFound, toResolveTruthy, toResolveFalsy, toResolveNull } from './utils/jest-ext';

expect.extend({
    toBeRejectedByPolicy,
    toBeNotFound,
    toResolveTruthy,
    toResolveFalsy,
    toResolveNull,
});
