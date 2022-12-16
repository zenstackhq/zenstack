import { NextRequest, NextResponse } from 'next/server';

export const config = {
    matcher: '/:path*',
};

const botUAPattern = /.*(Googlebot|bingbot).*/i;

export default async function middleware(req: NextRequest) {
    const url = req.nextUrl;

    if (url.pathname.includes('.')) {
        return NextResponse.next();
    }

    const ua = req.headers.get('user-agent');

    if (ua && botUAPattern.test(ua)) {
        const trimmed = url.pathname.replace(/^\//, '');
        if (trimmed === '' || trimmed === '/') {
            url.pathname = '/static/index.html';
        } else {
            url.pathname = `/static/${trimmed}.html`;
        }
        console.log(`REWRITE: ua - ${ua}, url - ${url.pathname}`);
        return NextResponse.rewrite(url);
    } else {
        url.pathname = '/index.html';
        return NextResponse.rewrite(url);
    }
}
