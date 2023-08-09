echo Setting Prisma Versions to V5
npx replace-in-file '/"prisma":\s*"\^4.\d.\d"/g' '"prisma": "^5.0.0"' 'packages/testtools/**/package*.json' 'tests/integration/**/package*.json' --isRegex
npx replace-in-file '/"@prisma/client":\s*"\^4.\d.\d"/g' '"@prisma/client": "^5.0.0"' 'packages/testtools/**/package*.json' 'tests/integration/**/package*.json' --isRegex
