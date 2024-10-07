/* eslint-disable */
import type { AnyTRPCRouter as AnyRouter } from "@trpc/server";
import type { PrismaClient } from "@prisma/client";
import { createTRPCRouter } from "../../generated-router-helper";
import createUserRouter from "./User.router";
import createPostRouter from "./Post.router";

export function db(ctx: any) {
    if (!ctx.prisma) {
        throw new Error('Missing "prisma" field in trpc context');
    }
    return ctx.prisma as PrismaClient;
}

export function createRouter() {
    return createTRPCRouter({
        user: createUserRouter(),
        post: createPostRouter(),
    }
    );
}
