import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

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
  app.enableCors();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('ORBIT API')
    .setDescription(
      'AI Personal Business, Life & Health Manager — Backend API documentation.\n\n' +
        'Use **Authorize** with a JWT from `/api/auth/login`, `/api/auth/register`, or `/api/auth/social`.\n\n' +
        'Chat supports multipart attachments: fields `content`, `images`, `documents`.',
    )
    .setVersion('1.0')
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
      'Conversations',
      'Medical chat with text, images, documents + health agent tools',
    )
    .addTag('Reminders', 'Medicine/appointment reminders, due polling, dose logs')
    .addTag('Symptoms', 'Symptom diary / check-ins')
    .addTag('Health Documents', 'Lab, prescription, imaging document metadata')
    .addTag('Devices', 'Push device token registration')
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
