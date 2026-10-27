import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import {
  AllExceptionsFilter,
  TransformResponseInterceptor,
} from './common/response';

async function bootstrap() {
  // rawBody required for Stripe webhook signature verification
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });

  const uploadDir = process.env.UPLOAD_DIR || '/var/orbit/uploads';
  app.useStaticAssets(uploadDir, { prefix: '/uploads/' });

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalInterceptors(
    new TransformResponseInterceptor(app.get(Reflector)),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableCors();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('ORBIT API')
    .setDescription(
      'AI Personal Business, Life & Health Manager — Backend API documentation.\n\n' +
        '## Response envelope (same for ALL APIs)\n' +
        'Success:\n' +
        '```json\n' +
        '{ "success": true, "code": "FETCHED", "message": "...", "statusCode": 200, "data": {}, "errors": null }\n' +
        '```\n' +
        'Error:\n' +
        '```json\n' +
        '{ "success": false, "code": "NOT_FOUND", "message": "...", "statusCode": 404, "data": null, "errors": null }\n' +
        '```\n' +
        'Validation error: `errors` is a string array.\n\n' +
        '## Auth\n' +
        'Use **Authorize** with a JWT from `/api/auth/login`, `/api/auth/register`, or `/api/auth/social`.\n\n' +
        '## Chat-first (primary)\n' +
        'Use **one endpoint**: `POST /api/chat`\n\n' +
        '- **No `conversationId`** → creates a new chat and returns the assistant reply\n' +
        '- **With `conversationId`** → continues that chat\n' +
        '- **`images` / `documents`** → optional (multipart)\n' +
        '- Main agent routes to domain sub-agents: **Health**, **Travel**, **Finance**, **Productivity**, **Business**\n' +
        '- Assistant message metadata may include `agent` and `routedTo`\n\n' +
        'History: `GET /api/conversations/{id}/messages` · List: `GET /api/conversations`\n\n' +
        '## Productivity + Google Calendar\n' +
        '1. Flutter GoogleSignIn with `serverClientId` = web `GOOGLE_CLIENT_ID` and Calendar scopes\n' +
        '2. `POST /api/productivity/calendar/google/connect` with `{ "serverAuthCode": "..." }`\n' +
        '3. `POST /api/productivity/calendar/google/sync` to import events into ORBIT\n' +
        '4. Use `GET/POST /api/productivity/calendar` for the app calendar UI\n' +
        'Requires `GOOGLE_CLIENT_SECRET` and Google Calendar API enabled.\n\n' +
        '## Business\n' +
        '`/api/business/notes`, `/api/business/tasks`, `POST /api/business/research` — notes/checklists, business tasks, web research.\n' +
        'Chat: “Business note…”, “Business task…”, “Research competitors…” → Main routes `BUSINESS`.\n\n' +
        '## Daily Summary\n' +
        '`GET /api/daily-summary` — cross-domain digest (reminders, calendar, tasks, trips, finance alerts).\n' +
        'Morning cron (~07:00 user TZ) generates + soft FCM. Chat: “What’s my daily summary?”',
    )
    .setVersion('1.1')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Paste the accessToken from login/register/social',
      },
      'JWT',
    )
    .addTag('Auth', 'Register, login, social login, current user')
    .addTag('Users', 'Admin user management (ADMIN / SUPERADMIN)')
    .addTag('Profile', 'User profile, interests, and medical situation')
    .addTag(
      'Chat',
      'Chat-first: POST /api/chat — Main router → Health / Travel / Finance / Productivity / Business',
    )
    .addTag(
      'Conversations',
      'List / history / move / delete conversations (send messages via /api/chat)',
    )
    .addTag(
      'Chat Folders',
      'ChatGPT-style folders — group many chats under Travel, Health, etc.',
    )
    .addTag(
      'Productivity',
      'Tasks, calendar events, daily plan, Google Calendar connect/sync',
    )
    .addTag(
      'Business',
      'Business notes/checklists, business tasks, informational research',
    )
    .addTag(
      'Travel',
      'Travel preferences, trips, offers; hotel/flight search via chat',
    )
    .addTag(
      'Finance',
      'Budget, watchlist, alerts; live quotes/news via chat only (no cron polling)',
    )
    .addTag(
      'Reminders',
      'Medicine/appointment/travel/task reminders, due polling, dose logs',
    )
    .addTag('Schedules', 'Unified list of reminders and upcoming schedules')
    .addTag('Symptoms', 'Symptom diary / check-ins')
    .addTag('Health Documents', 'Lab, prescription, imaging document metadata')
    .addTag('Devices', 'Push device token registration (FCM)')
    .addTag(
      'Notifications',
      'Daily summary digest + soft morning FCM (critical alerts via Reminders/Finance)',
    )
    .addTag(
      'Support',
      'Contact support — email + subject + description → admin inbox',
    )
    .addTag(
      'Health Check',
      'Main-page wellness quiz — questions, submit, latest result (not a diagnosis)',
    )
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`ORBIT API running on http://localhost:${port}/api`);
  console.log(`Swagger docs at http://localhost:${port}/docs`);
  console.log(`Uploads served at http://localhost:${port}/uploads/`);
}
bootstrap();
