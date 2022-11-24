import { NextPage } from 'next';
import { FormEvent, useState } from 'react';
import { useSpace, type HooksError } from '@zenstackhq/runtime/hooks';
import { toast } from 'react-toastify';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { SpaceUserRole } from '@zenstackhq/runtime/types';
import { ServerErrorCode } from '@zenstackhq/runtime/client';

const CreateSpace: NextPage = () => {
    const { data: session } = useSession();
    const [name, setName] = useState('');
    const [slug, setSlug] = useState('');

    const { create } = useSpace();
    const router = useRouter();

    const onSubmit = async (event: FormEvent) => {
        event.preventDefault();
        try {
            const space = await create({
                data: {
                    name,
                    slug,
                    members: {
                        create: [
                            {
                                userId: session!.user.id,
                                role: SpaceUserRole.ADMIN,
                            },
                        ],
                    },
                },
            });
            console.log('Space created:', space);
            toast.success("Space created successfull! You'll be redirected.");

            setTimeout(() => {
                if (space) {
                    router.push(`/space/${space.slug}`);
                }
            }, 2000);
        } catch (err: any) {
            console.error(err);
            if (
                (err as HooksError).info?.code ===
                ServerErrorCode.UNIQUE_CONSTRAINT_VIOLATION
            ) {
                toast.error('Space slug alread in use');
            } else {
                toast.error(
                    `Error occurred: ${err.info?.message || err.message}`
                );
            }
        }
    };

    return (
        <div className="flex items-center justify-center h-full">
            <form onSubmit={onSubmit}>
                <h1 className="text-3xl mb-8">Create a space</h1>
                <div className="flex-col space-y-4">
                    <div>
                        <label htmlFor="name" className="text-lg">
                            Space name
                        </label>
                        <input
                            id="name"
                            type="text"
                            required
                            placeholder="Name of your space"
                            className="input input-bordered w-full max-w-xs mt-2"
                            onChange={(e: FormEvent<HTMLInputElement>) =>
                                setName(e.currentTarget.value)
                            }
                        />
                    </div>
                    <div>
                        <label htmlFor="slug" className="text-lg">
                            Space slug
                        </label>
                        <input
                            id="slug"
                            type="text"
                            required
                            placeholder="Slug of your space"
                            className="input input-bordered w-full max-w-xs mt-2"
                            onChange={(e: FormEvent<HTMLInputElement>) =>
                                setSlug(e.currentTarget.value)
                            }
                        />
                    </div>
                </div>

                <div className="flex space-x-4 mt-6">
                    <input
                        type="submit"
                        disabled={
                            name.length < 4 ||
                            name.length > 20 ||
                            !slug.match(/^[0-9a-zA-Z]{4,16}$/)
                        }
                        value="Create"
                        className="btn btn-primary px-8"
                    />
                    <button
                        className="btn btn-outline"
                        onClick={() => router.push('/')}
                    >
                        Cancel
                    </button>
                </div>
            </form>
        </div>
    );
};

export default CreateSpace;
