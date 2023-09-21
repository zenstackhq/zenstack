import { createPostgresDb, dropPostgresDb, loadSchema } from '@zenstackhq/testtools';
import { randomUUID } from 'crypto';

const model = `
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["multiSchema"]
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  schemas  = ["userauth", "orgs", "courses", "logging"]
}

abstract model Basic {
    id String @id @default(uuid())
    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt
    createdBy User @relation(fields: [createdBy_id], references: [id], onDelete: Cascade)
    createdBy_id String
    updatedBy User? @relation(fields: [updatedBy_id], references: [id], onDelete: Cascade)
    updatedBy_id String?
    institute Institute @relation(fields: [institute_id], references: [id], onDelete: Cascade)
    institute_id String

    @@allow('read,create,update', createdBy == auth() || institute.userRoles?[user == auth()] )
    @@allow('all', (createdBy == auth() && institute.userRoles?[user == auth()]) || institute.userRoles?[user == auth() && 'Admin' in role])
}

model User {
  id                       String              @id @unique
  firstname                String
  lastname                 String?
  username                 String              @unique
  photo                    String   @default("media/default/avatar.jpg")
  dob                      DateTime?
  gender                   String?
  bio                      String?
  tagline                  String?
  address                  String?
  city                     String?
  country                  String?
  email                    String?
  phone                    String?
  accountRegType           String   @default("General")
  createdAt                DateTime @default(now())
  updatedAt                DateTime @updatedAt @default(now())
  createdBy_id             String   @default("self")
  updatedBy_id             String   @default("self")
  auth_session             AuthSession[]
  auth_key                 AuthKey[]
  userRole                 userRole[]
  batchUser                BatchUser[]
  enrollment               Enrollment[]
  userRoleCreatedBy        userRole[]             @relation("userRolesCreatedBy")
  instituteCreatedBy       Institute[]             @relation("InstituteCreatedBy")
  instituteUpdatedBy       Institute[]             @relation("InstituteUpdatedBy")
  courseCreatedBy          Course[]            @relation("CourseCreatedBy")
  courseUpdatedBy          Course[]            @relation("CourseUpdatedBy")
  courseAuthors            Course[]            @relation("CourseAuthors")
  courseInstructor         Course[]            @relation("CourseInstructors")
  enrollmentCreatedBy      Enrollment[]        @relation("EnrollmentCreatedBy")
  enrollmentUpdatedBy      Enrollment[]        @relation("EnrollmentUpdatedBy")
  certificateIssued        CertificateIssued[]
	admissions               Admission[]         @relation(name: "AdmissionStudent")

  deleted    Boolean @default(false) @omit   // soft delete
  @@deny('read', deleted)

  // everybody can signup
  @@allow('create,read', true)

  // full access by self
  @@allow('all', auth() == this)

  @@allow('all', userRole?[user == auth() && 'Admin' in role])
  @@allow('read', userRole?[user == auth()])

  @@map("auth_user")
  @@schema("userauth")
}

model AuthSession {
  id             String @id @unique
  user_id        String
  active_expires BigInt
  idle_expires   BigInt
  auth_user      User   @relation(references: [id], fields: [user_id], onDelete: Cascade)

  @@index([user_id])
  @@map("auth_session")
  @@schema("userauth")
}

model AuthKey {
  id              String   @id @unique
  hashed_password String?
  user_id         String
  primary_key     Boolean?
  expires         BigInt?
  auth_user       User     @relation(references: [id], fields: [user_id], onDelete: Cascade)

  @@index([user_id])
  @@map("auth_key")
  @@schema("userauth")
}

model Institute {
  id                         String                       @id @unique @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  mode                       String 
  schoolname                 String                       @unique
  name                       String
  address                    String?
  city                       String
  country                    String
  type                       String? 
  website                    String?
  phone                      BigInt?
  authenticationMethod       String[]
  periodsInADay              Int?
  periodDuration             Int?
  periods                    Int[]
  workingDays                String[]
  officeHoursFrom            Int?
  officeHoursTo              Int?
  createdAt                  DateTime                     @default(now())
  updatedAt                  DateTime                     @updatedAt
  createdBy User? @relation(name: "InstituteCreatedBy", fields: [createdBy_id], references: [id])
  createdBy_id String?
  updatedBy User? @relation(name: "InstituteUpdatedBy", fields: [updatedBy_id], references: [id])
  updatedBy_id String?
  userRoles                  userRole[]
  enrollments                Enrollment[]
  certificatesIssued         CertificateIssued[]
  Batch                      Batch[]
  courses                    Course[]

	admissions Admission[]

  @@allow('read', userRoles?[user == auth()])

  @@map("institute")
  @@schema("orgs")
}

model userRole {
  id           String    @id @unique @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  user         User      @relation(references: [id], onDelete: Cascade, fields: [user_id])
  user_id      String
  institute    Institute @relation(references: [id], onDelete: Cascade, fields: [institute_id])
  institute_id String    @db.Uuid
  role         String[]
  department   String?
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
  createdBy    User @relation(name: "userRolesCreatedBy", fields: [createdBy_id], references: [id], onDelete: Cascade)
  createdBy_id String

  @@unique([user_id, institute_id])

  @@allow('all', institute.userRoles?[user == auth() && 'Admin' in role])
  @@allow('read', institute.userRoles?[user == auth()])

  @@map("user_role")
  @@schema("userauth")
}

model Batch {
  id           String      @id @unique @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name         String
  users        BatchUser[]
  institute    Institute   @relation(references: [id], fields: [institute_id])
  institute_id String      @db.Uuid
  capacity     Int         @default(30)
  intake       String 
  year         Int         @default(2023)
  status       String      @default("Active")
  createdAt    DateTime    @default(now())
  updatedAt    DateTime    @updatedAt
  createdBy    String
  updatedBy    String

  enrollments Enrollment[]

  @@map("batch")
  @@schema("courses")
}

model BatchUser {
  id       String  @id @unique @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  user_id  String
  user     User    @relation(fields: [user_id], references: [id])
  role     String
  Batch    Batch?  @relation(fields: [batch_id], references: [id])
  batch_id String? @db.Uuid

  @@map("batch_user")
  @@schema("courses")
}

model Admission {
  id                String              @id @unique @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  student           User                @relation(name: "AdmissionStudent", fields: [student_id], references: [id])
  student_id        String
  admissionOfficer  String?             
  admissionNumber   BigInt
  admissionDate     DateTime            @default(now())
  enrollments       Enrollment[]
  status            String              @default("Applied")
  institute         Institute           @relation(references: [id], fields: [institute_id])
  institute_id      String              @db.Uuid
  createdAt         DateTime            @default(now())
  updatedAt         DateTime            @updatedAt
  createdBy_id      String              @default("self")
  updatedBy_id      String              @default("self")

  @@unique([student_id, institute_id])
  @@unique([admissionNumber, institute_id])

  @@map("admission")
  @@schema("orgs")
}

model Enrollment {
  id                String              @id @unique @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  student           User                @relation(fields: [student_id], references: [id])
  student_id        String
  admission         Admission           @relation(fields: [admission_id], references: [id])
  admission_id      String              @db.Uuid
  course            Course              @relation(fields: [course_id], references: [id])
  course_id         String              @db.Uuid
  batch             Batch               @relation(fields: [batch_id], references: [id])
  batch_id          String              @db.Uuid
  enrollmentDate    DateTime            @default(now())
  status            String              @default("Active")
  institute         Institute           @relation(references: [id], fields: [institute_id])
  institute_id      String              @db.Uuid
  createdAt         DateTime            @default(now())
  updatedAt         DateTime            @updatedAt
  createdBy         User              @relation(name: "EnrollmentCreatedBy", fields: [createdBy_id], references: [id])
  createdBy_id      String
  updatedBy         User              @relation(name: "EnrollmentUpdatedBy", fields: [updatedBy_id], references: [id])
  updatedBy_id      String
  certificatesIssued CertificateIssued[]

  @@allow('all', (createdBy == auth() && institute.userRoles?[user == auth()]) || institute.userRoles?[user == auth() && 'Admin' in role])
  @@allow('read', (student == auth() || course.instructors == auth() || course.authors == auth())  && institute.userRoles?[user == auth()])

  @@map("enrollment")
  @@schema("courses")
}

model CertificateIssued {
  id                 String      @id @unique @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  enrollment         Enrollment? @relation(references: [id], fields: [enrollment_id])
  enrollment_id      String?     @db.Uuid
  student            User        @relation(fields: [student_id], references: [id])
  student_id         String
  customContent      String
  issueDate          DateTime
  certificateUrl     String 
  certificateType    String 
  certificateSharing String?
  institute          Institute   @relation(references: [id], fields: [institute_id])
  institute_id       String      @db.Uuid
  createdAt          DateTime    @default(now())
  updatedAt          DateTime    @updatedAt
  createdBy          String
  updatedBy          String

  @@map("certificate_issued")
  @@schema("courses")
}

model Course {
  id            String             @id @unique @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  authors       User[]             @relation("CourseAuthors")
  instructors   User[]             @relation("CourseInstructors")
  authorityCode String             
  title         String
  description   String?
  image         String?
  basePrice     Float              @default(0)
  baseCurrency  String             @default("QAR")
  order         Int                @default(autoincrement())
  status        String
  sharedLevel   String[]           @default(["Course Instructors"]) //['Public', 'Institute Everyone', 'Course Everyone', 'Course Instructors', 'Batch', 'Grade']
  institute     Institute          @relation(references: [id], fields: [institute_id])
  institute_id  String             @db.Uuid
  createdAt     DateTime           @default(now())
  updatedAt     DateTime           @updatedAt
  createdBy     User               @relation(name: "CourseCreatedBy", fields: [createdBy_id], references: [id])
  createdBy_id  String
  updatedBy     User               @relation(name: "CourseUpdatedBy", fields: [updatedBy_id], references: [id])
  updatedBy_id  String
  enrollments   Enrollment[]


  deleted    Boolean @default(false) @omit   // soft delete
  @@deny('read', deleted)

  @@allow('all', (createdBy == auth() && institute.userRoles?[user == auth()]) || institute.userRoles?[user == auth() && 'Admin' in role])
  @@allow('read', true)  //public can read
  @@allow('read, update', (authors == auth() || instructors == auth())  && institute.userRoles?[user == auth()])
  @@allow('read, update, create', institute.userRoles?[user == auth() && ('Instructor' in role || 'Author' in role)])

  @@map("course")
  @@schema("courses")
}`;

describe('Regression: issue 704', () => {
    const DB_NAME = 'refactor';
    let dbUrl: string;
    let prisma: any;

    beforeEach(async () => {
        dbUrl = await createPostgresDb(DB_NAME);
    });

    afterEach(async () => {
        if (prisma) {
            await prisma.$disconnect();
        }
        await dropPostgresDb(DB_NAME);
    });

    it('regression', async () => {
        const dbUrl = await createPostgresDb(DB_NAME);
        const myModel = model.replace('env("DATABASE_URL")', `"${dbUrl}"`);

        const r = await loadSchema(myModel, {
            provider: 'postgresql',
            dbUrl,
            addPrelude: false,
            logPrismaQuery: true,
        });

        prisma = r.prisma;
        const db = r.enhance({ id: '1' });
        const myCorseIds = [randomUUID()];
        await db.enrollment.count({
            where: {
                course_id: {
                    in: myCorseIds,
                },
            },
        });
    });
});
