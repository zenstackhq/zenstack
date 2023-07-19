echo Setting Prisma Versions to V5
npx replace-in-file '/"prisma":\s*"\^4.0.0"/g' '"prisma": "^5.0.0"' 'packages/testtools/**/package*.json' 'tests/integration/**/package*.json' --isRegex
npx replace-in-file '/"@prisma/client":\s*"\^4.0.0"/g' '"@prisma/client": "^5.0.0"' 'packages/testtools/**/package*.json' 'tests/integration/**/package*.json' --isRegex
