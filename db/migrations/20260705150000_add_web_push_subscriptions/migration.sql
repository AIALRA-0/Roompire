CREATE TABLE "NotificationPushSubscription" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "endpoint" VARCHAR(2048) NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "userAgent" VARCHAR(500),
    "disabledAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPushSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NotificationPushSubscription_endpoint_key" ON "NotificationPushSubscription"("endpoint");
CREATE INDEX "NotificationPushSubscription_userId_disabledAt_idx" ON "NotificationPushSubscription"("userId", "disabledAt");
CREATE INDEX "NotificationPushSubscription_lastSeenAt_idx" ON "NotificationPushSubscription"("lastSeenAt");

ALTER TABLE "NotificationPushSubscription" ADD CONSTRAINT "NotificationPushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
