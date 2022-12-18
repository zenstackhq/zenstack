import { trpc } from '@lib/trpc';
import { HooksError, ServerErrorCode } from '@zenstackhq/runtime/client';
import { signIn } from 'next-auth/react';
import Image from 'next/image';
import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { toast } from 'react-toastify';

export default function Signup() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const { mutateAsync: signup } = trpc.user.createOne.useMutation();

    async function onSignup(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        try {
            await signup({ data: { email, password } });
        } catch (err: any) {
            console.error(err);
            if (
                (err as HooksError).info?.code ===
                ServerErrorCode.UNIQUE_CONSTRAINT_VIOLATION
            ) {
                toast.error('User already exists');
            } else {
                toast.error(
                    `Error occurred: ${err.info?.message || err.message}`
                );
            }
            return;
        }

        const signInResult = await signIn('credentials', {
            redirect: false,
            email,
            password,
        });
        if (signInResult?.ok) {
            window.location.href = '/';
        } else {
            console.error('Signin failed:', signInResult?.error);
        }
    }

    return (
        <div className="flex flex-col items-center justify-center px-6 pt-4 lg:pt-8 mx-auto h-screen bg-cover bg-[url('/auth-bg.jpg')]">
            <Link href="/">
                <div className="flex space-x-4 items-center mb-6 lg:mb-10">
                    <Image src="/logo.png" width={42} height={42} alt="logo" />
                    <h1 className="text-4xl text-white">Welcome to Todo</h1>
                </div>
            </Link>
            <div className="items-center justify-center w-full bg-white rounded-lg shadow lg:flex md:mt-0 lg:max-w-screen-md xl:p-0">
                <div className="w-full p-6 space-y-8 sm:p-8 lg:p-16">
                    <h2 className="text-2xl font-bold text-gray-900 lg:text-3xl">
                        Create a Free Account
                    </h2>
                    <form
                        className="mt-8"
                        action="#"
                        onSubmit={(e) => onSignup(e)}
                    >
                        <div className="mb-6">
                            <label
                                htmlFor="email"
                                className="block mb-2 text-sm font-medium text-gray-900"
                            >
                                Your email
                            </label>
                            <input
                                type="email"
                                id="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="bg-gray-50 border border-gray-300 text-gray-900 sm:text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block w-full p-2.5"
                                placeholder="Email address"
                                required
                            />
                        </div>
                        <div className="mb-6">
                            <label
                                htmlFor="password"
                                className="block mb-2 text-sm font-medium text-gray-900"
                            >
                                Your password
                            </label>
                            <input
                                type="password"
                                id="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                className="bg-gray-50 border border-gray-300 text-gray-900 sm:text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block w-full p-2.5"
                                required
                            />
                        </div>
                        <div className="flex items-start">
                            <div className="flex items-center h-5">
                                <input
                                    id="remember"
                                    aria-describedby="remember"
                                    name="remember"
                                    type="checkbox"
                                    className="w-4 h-4 border-gray-300 rounded bg-gray-50 focus:ring-3 focus:ring-primary-300"
                                    required
                                />
                            </div>
                            <div className="ml-3 text-sm">
                                <label
                                    htmlFor="remember"
                                    className="font-medium text-gray-900"
                                >
                                    I accept the{' '}
                                    <a
                                        href="#"
                                        className="text-primary-700 hover:underline"
                                    >
                                        Terms and Conditions
                                    </a>
                                </label>
                            </div>
                        </div>
                        <button className="btn btn-primary mt-4" type="submit">
                            Create account
                        </button>
                        <div className="mt-4 text-sm font-medium text-gray-500">
                            Already have an account?{' '}
                            <Link href="/signin" className="text-primary-700">
                                <a className="text-primary">Login here</a>
                            </Link>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
