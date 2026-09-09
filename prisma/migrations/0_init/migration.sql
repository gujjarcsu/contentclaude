-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandVoice" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "storeName" TEXT NOT NULL DEFAULT '',
    "brandTone" TEXT NOT NULL DEFAULT 'professional',
    "targetAudience" TEXT NOT NULL DEFAULT '',
    "keyDifferentiators" TEXT NOT NULL DEFAULT '',
    "avoidPhrases" TEXT NOT NULL DEFAULT '',
    "sampleContent" TEXT NOT NULL DEFAULT '',
    "additionalNotes" TEXT NOT NULL DEFAULT '',
    "targetKeywords" TEXT NOT NULL DEFAULT '',
    "language" TEXT NOT NULL DEFAULT 'en',
    "autopilotEnabled" BOOLEAN NOT NULL DEFAULT false,
    "autopilotAutoPublish" BOOLEAN NOT NULL DEFAULT false,
    "autopilotContentTypes" TEXT NOT NULL DEFAULT 'description,metaTitle,metaDescription',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandVoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeneratedContent" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productTitle" TEXT NOT NULL DEFAULT '',
    "contentType" TEXT NOT NULL,
    "originalContent" TEXT NOT NULL DEFAULT '',
    "generatedContent" TEXT NOT NULL DEFAULT '',
    "publishedContent" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GeneratedContent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "planName" TEXT NOT NULL DEFAULT 'free',
    "status" TEXT NOT NULL DEFAULT 'active',
    "monthlyLimit" INTEGER NOT NULL DEFAULT 25,
    "shopifyChargeId" TEXT,
    "currentPeriodEnd" TIMESTAMP(3),
    "trialEndsAt" TIMESTAMP(3),
    "renewsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageRecord" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "productId" TEXT,
    "tokensUsed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GDPRRequest" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "requestType" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GDPRRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentVersion" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentTemplate" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contentLength" TEXT NOT NULL DEFAULT 'standard',
    "contentTypes" TEXT NOT NULL DEFAULT 'description,metaTitle,metaDescription',
    "keywords" TEXT NOT NULL DEFAULT '',
    "customInstructions" TEXT NOT NULL DEFAULT '',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GenerationJob" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "totalProducts" INTEGER NOT NULL DEFAULT 0,
    "completedProducts" INTEGER NOT NULL DEFAULT 0,
    "failedProducts" INTEGER NOT NULL DEFAULT 0,
    "productIds" TEXT NOT NULL DEFAULT '[]',
    "contentTypes" TEXT NOT NULL DEFAULT 'description',
    "mode" TEXT NOT NULL DEFAULT 'generate',
    "autoPublish" BOOLEAN NOT NULL DEFAULT false,
    "quotaSkipped" INTEGER NOT NULL DEFAULT 0,
    "errorLog" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GenerationJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionVoice" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "brandTone" TEXT NOT NULL DEFAULT '',
    "targetAudience" TEXT NOT NULL DEFAULT '',
    "keywords" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "CollectionVoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrowthState" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "reviewRequestedAt" TIMESTAMP(3),
    "welcomeSeenAt" TIMESTAMP(3),
    "embedConfirmedAt" TIMESTAMP(3),
    "setupCompletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GrowthState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlogPost" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "content" TEXT NOT NULL DEFAULT '',
    "wordCount" INTEGER NOT NULL DEFAULT 0,
    "topic" TEXT NOT NULL DEFAULT '',
    "keywords" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "shopifyArticleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlogPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shop" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "installSource" TEXT NOT NULL DEFAULT 'unknown',
    "surfaceType" TEXT,
    "surfaceDetail" TEXT,
    "surfaceIntraPosition" TEXT,
    "surfaceInterPosition" TEXT,
    "installRef" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "installReferer" TEXT,
    "installLandingPath" TEXT,
    "installCount" INTEGER NOT NULL DEFAULT 1,
    "reinstalledAt" TIMESTAMP(3),
    "reinstallSource" TEXT,
    "reinstallReferer" TEXT,
    "uninstalledAt" TIMESTAMP(3),
    "redactedAt" TIMESTAMP(3),
    "trialUsedAt" TIMESTAMP(3),
    "usageMonth" TEXT,
    "usageCarryover" INTEGER NOT NULL DEFAULT 0,
    "productCountAtFirstLoad" INTEGER,
    "quickStartStartedAt" TIMESTAMP(3),
    "quickStartDraftCount" INTEGER NOT NULL DEFAULT 0,
    "firstDraftSeenAt" TIMESTAMP(3),
    "firstDraftSource" TEXT,
    "firstPublishAt" TIMESTAMP(3),
    "firstPublishSource" TEXT,
    "reviewAskCount" INTEGER NOT NULL DEFAULT 0,
    "reviewLastAskedAt" TIMESTAMP(3),
    "reviewLastCode" TEXT,
    "reviewNextEligibleAt" TIMESTAMP(3),
    "reviewShownAt" TIMESTAMP(3),
    "reviewDoneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewRequestAttempt" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "surface" TEXT NOT NULL,
    "trigger" TEXT NOT NULL DEFAULT 'publish',
    "attemptNo" INTEGER NOT NULL DEFAULT 1,
    "publishedCount" INTEGER NOT NULL DEFAULT 0,
    "installAgeSeconds" INTEGER,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),
    "code" TEXT,
    "success" BOOLEAN,
    "message" TEXT,
    "nextEligibleAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewRequestAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UpgradePrompt" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "surface" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "n" INTEGER NOT NULL DEFAULT 0,
    "nDefinition" TEXT NOT NULL DEFAULT 'catalog_gaps',
    "truncated" BOOLEAN NOT NULL DEFAULT false,
    "remaining" INTEGER NOT NULL DEFAULT 0,
    "monthlyLimit" INTEGER NOT NULL DEFAULT 0,
    "currentPlan" TEXT NOT NULL DEFAULT 'free',
    "fitPlanName" TEXT,
    "monthsToCover" INTEGER NOT NULL DEFAULT 1,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shownCount" INTEGER NOT NULL DEFAULT 0,
    "firstShownAt" TIMESTAMP(3),
    "lastShownAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "ctaClickedAt" TIMESTAMP(3),
    "arrivedAtPlansAt" TIMESTAMP(3),
    "subscribeRequestedAt" TIMESTAMP(3),
    "planKeyRequested" TEXT,
    "planChosen" TEXT,
    "planChosenFrom" TEXT,
    "planChosenAt" TIMESTAMP(3),
    "chargeId" TEXT,
    "declinedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UpgradePrompt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Session_shop_idx" ON "Session"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "BrandVoice_shop_key" ON "BrandVoice"("shop");

-- CreateIndex
CREATE INDEX "GeneratedContent_shop_productId_idx" ON "GeneratedContent"("shop", "productId");

-- CreateIndex
CREATE INDEX "GeneratedContent_shop_status_idx" ON "GeneratedContent"("shop", "status");

-- CreateIndex
CREATE INDEX "GeneratedContent_shop_contentType_status_idx" ON "GeneratedContent"("shop", "contentType", "status");

-- CreateIndex
CREATE INDEX "GeneratedContent_shop_updatedAt_idx" ON "GeneratedContent"("shop", "updatedAt");

-- CreateIndex
CREATE INDEX "GeneratedContent_shop_status_productId_idx" ON "GeneratedContent"("shop", "status", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "GeneratedContent_shop_productId_contentType_key" ON "GeneratedContent"("shop", "productId", "contentType");

-- CreateIndex
CREATE UNIQUE INDEX "Plan_shop_key" ON "Plan"("shop");

-- CreateIndex
CREATE INDEX "UsageRecord_shop_month_idx" ON "UsageRecord"("shop", "month");

-- CreateIndex
CREATE INDEX "UsageRecord_shop_createdAt_idx" ON "UsageRecord"("shop", "createdAt");

-- CreateIndex
CREATE INDEX "UsageRecord_shop_productId_createdAt_idx" ON "UsageRecord"("shop", "productId", "createdAt");

-- CreateIndex
CREATE INDEX "GDPRRequest_shop_idx" ON "GDPRRequest"("shop");

-- CreateIndex
CREATE INDEX "GDPRRequest_requestType_idx" ON "GDPRRequest"("requestType");

-- CreateIndex
CREATE INDEX "GDPRRequest_processedAt_idx" ON "GDPRRequest"("processedAt");

-- CreateIndex
CREATE INDEX "ContentVersion_shop_productId_contentType_idx" ON "ContentVersion"("shop", "productId", "contentType");

-- CreateIndex
CREATE INDEX "ContentVersion_shop_createdAt_idx" ON "ContentVersion"("shop", "createdAt");

-- CreateIndex
CREATE INDEX "ContentTemplate_shop_idx" ON "ContentTemplate"("shop");

-- CreateIndex
CREATE INDEX "GenerationJob_shop_status_idx" ON "GenerationJob"("shop", "status");

-- CreateIndex
CREATE INDEX "GenerationJob_shop_createdAt_idx" ON "GenerationJob"("shop", "createdAt");

-- CreateIndex
CREATE INDEX "GenerationJob_status_startedAt_idx" ON "GenerationJob"("status", "startedAt");

-- CreateIndex
CREATE INDEX "CollectionVoice_shop_idx" ON "CollectionVoice"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionVoice_shop_collectionId_key" ON "CollectionVoice"("shop", "collectionId");

-- CreateIndex
CREATE UNIQUE INDEX "GrowthState_shop_key" ON "GrowthState"("shop");

-- CreateIndex
CREATE INDEX "BlogPost_shop_status_idx" ON "BlogPost"("shop", "status");

-- CreateIndex
CREATE INDEX "BlogPost_shop_createdAt_idx" ON "BlogPost"("shop", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Shop_shop_key" ON "Shop"("shop");

-- CreateIndex
CREATE INDEX "Shop_installedAt_idx" ON "Shop"("installedAt");

-- CreateIndex
CREATE INDEX "Shop_installSource_idx" ON "Shop"("installSource");

-- CreateIndex
CREATE INDEX "Shop_firstDraftSeenAt_idx" ON "Shop"("firstDraftSeenAt");

-- CreateIndex
CREATE INDEX "Shop_firstPublishAt_idx" ON "Shop"("firstPublishAt");

-- CreateIndex
CREATE INDEX "ReviewRequestAttempt_shop_requestedAt_idx" ON "ReviewRequestAttempt"("shop", "requestedAt");

-- CreateIndex
CREATE INDEX "ReviewRequestAttempt_code_idx" ON "ReviewRequestAttempt"("code");

-- CreateIndex
CREATE INDEX "UpgradePrompt_shop_lastSeenAt_idx" ON "UpgradePrompt"("shop", "lastSeenAt");

-- CreateIndex
CREATE INDEX "UpgradePrompt_chargeId_idx" ON "UpgradePrompt"("chargeId");

-- CreateIndex
CREATE UNIQUE INDEX "UpgradePrompt_shop_trigger_surface_month_key" ON "UpgradePrompt"("shop", "trigger", "surface", "month");

