/**
 * Playwright Screen Recording Script
 * Target: Playlog Campaign Media Buyer Public Report
 *
 * Enhanced features:
 * - Robust removal of broken StickEarn logo & divider line (DOM removal + CSS + route abort)
 * - True container smooth scrolling (document.body scrollTop animation with cubic easing)
 * - Animated visible mouse cursor with expanding click ripples
 * - Date Filter interaction: Enters custom date range and clicks search icon
 * - Active Chart Hovers across all sections:
 *   * Hourly Performance line/area chart (hourly tooltips)
 *   * Daily Average bar chart (weekday tooltips)
 *   * Daily Performance trendline (daily impression spikes)
 *   * Age Demographics bar chart (age bracket tooltips)
 *   * Gender Demographic donut chart (gender percentage tooltips)
 *   * Geographical Location distribution (city breakdown tooltips)
 * - Subtab navigation: Media Plan / Inventory toggling & Documentations (Proof of Performance photos)
 * - 1920x1080 resolution saved as high-quality MP4 (and WebM)
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

// Path to ffmpeg static binary
const ffmpegPath = require('ffmpeg-static');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Smooth cursor glide using cubic easeInOut
async function moveMouseSmooth(page, currentPos, targetX, targetY, steps = 24, stepDelay = 12) {
  const startX = currentPos.x;
  const startY = currentPos.y;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const curX = startX + (targetX - startX) * ease;
    const curY = startY + (targetY - startY) * ease;
    await page.mouse.move(curX, curY);
    await sleep(stepDelay);
  }
  currentPos.x = targetX;
  currentPos.y = targetY;
}

// Smooth locator click with natural cursor approach and ripple indicator
async function smoothClickLocator(page, locator, currentPos, pauseAfter = 1000) {
  await locator.scrollIntoViewIfNeeded();
  await sleep(200);
  const box = await locator.boundingBox();
  if (box) {
    const targetX = box.x + box.width / 2;
    const targetY = box.y + box.height / 2;
    await moveMouseSmooth(page, currentPos, targetX, targetY, 22, 12);
    await sleep(150);
    await page.mouse.down();
    await sleep(120);
    await page.mouse.up();
  } else {
    await locator.click();
  }
  if (pauseAfter > 0) {
    await sleep(pauseAfter);
  }
}

// Natural typing with random delays
async function smoothType(page, locator, text, currentPos, minDelay = 50, maxDelay = 90) {
  await smoothClickLocator(page, locator, currentPos, 250);
  for (const char of text) {
    await page.keyboard.type(char);
    const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
    await sleep(delay);
  }
  await sleep(300);
}

// Smooth programmatic body scrolling
async function smoothScrollToY(page, targetY, durationMs = 1100) {
  await page.evaluate(async ({ targetY, durationMs }) => {
    const scroller = document.body.scrollHeight > document.body.clientHeight ? document.body : (document.scrollingElement || document.documentElement);
    await new Promise((resolve) => {
      const start = performance.now();
      const startY = scroller.scrollTop;
      const diff = targetY - startY;
      if (Math.abs(diff) < 2) return resolve();

      function step(now) {
        const elapsed = now - start;
        const progress = Math.min(elapsed / durationMs, 1);
        const ease = progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;
        scroller.scrollTop = startY + diff * ease;
        if (progress < 1) {
          requestAnimationFrame(step);
        } else {
          scroller.scrollTop = targetY;
          resolve();
        }
      }
      requestAnimationFrame(step);
    });
  }, { targetY, durationMs });
  await sleep(250);
}

// Hover across horizontal data points on a chart to display ApexCharts tooltips
async function hoverChartPoints(page, chartLocator, currentPos, pointsCount = 4, pausePerPoint = 700) {
  await chartLocator.scrollIntoViewIfNeeded();
  await sleep(200);
  const box = await chartLocator.boundingBox();
  if (!box || box.width < 50 || box.height < 50) return;

  const startX = box.x + box.width * 0.12;
  const endX = box.x + box.width * 0.88;
  const centerY = box.y + box.height * 0.52;
  const stepX = (endX - startX) / (pointsCount - 1);

  for (let i = 0; i < pointsCount; i++) {
    const targetX = startX + stepX * i;
    const targetY = centerY + (i % 2 === 0 ? -10 : 10);
    await moveMouseSmooth(page, currentPos, targetX, targetY, 16, 10);
    await sleep(pausePerPoint);
  }
  await sleep(200);
}

// Hover across circular/donut chart slices
async function hoverDonutSlices(page, chartLocator, currentPos, maxSlices = 3, pausePerSlice = 700) {
  await chartLocator.scrollIntoViewIfNeeded();
  await sleep(200);

  const slices = chartLocator.locator('path.apexcharts-pie-area, path.apexcharts-donut-slice, g.apexcharts-series path');
  const count = await slices.count();
  if (count > 0) {
    const limit = Math.min(count, maxSlices);
    for (let i = 0; i < limit; i++) {
      const sliceBox = await slices.nth(i).boundingBox();
      if (sliceBox && sliceBox.y > 50 && sliceBox.y < 1000) {
        await moveMouseSmooth(page, currentPos, sliceBox.x + sliceBox.width / 2, sliceBox.y + sliceBox.height / 2, 16, 10);
        await sleep(pausePerSlice);
      }
    }
  } else {
    const box = await chartLocator.boundingBox();
    if (box && box.y > 0 && box.y < 1000) {
      const centerX = box.x + box.width / 2;
      const centerY = box.y + box.height / 2;
      await moveMouseSmooth(page, currentPos, centerX, centerY, 16, 10);
      await sleep(pausePerSlice);
    }
  }
  await sleep(200);
}

(async () => {
  const targetUrl = 'https://dashboard.playlog.io/#/campaign-media-buyer-public/login?campaignId=74619d65-d61e-47d2-bee1-dacb0d4d8922';
  const recordingsDir = path.join(__dirname, 'recordings_temp');
  if (!fs.existsSync(recordingsDir)) {
    fs.mkdirSync(recordingsDir, { recursive: true });
  }

  console.log('Launching browser for video recording...');
  const browser = await chromium.launch({ headless: true });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: {
      dir: recordingsDir,
      size: { width: 1920, height: 1080 }
    }
  });

  // Block loading of the broken StickEarn brand logo image asset
  await context.route('**/brand_logo/**', route => route.abort());

  // Inject visible simulated cursor, click ripple animation, and robust StickEarn logo cleaner
  await context.addInitScript(() => {
    // 1. Permanently remove broken StickEarn logo & orphaned divider line
    function removeStickearn() {
      const els = document.querySelectorAll('img[alt*="Stickearn" i], img[src*="brand_logo"], .brand-logo, .brand-line');
      els.forEach(el => el.remove());
    }

    removeStickearn();
    setInterval(removeStickearn, 40);

    // 2. CSS fallback to guarantee instant hidden state before removal
    function injectHideStyle() {
      if (!document.getElementById('anti-stickearn-style')) {
        const s = document.createElement('style');
        s.id = 'anti-stickearn-style';
        s.textContent = `
          img[alt*="Stickearn" i],
          img[src*="brand_logo"],
          .brand-headers img,
          .brand-logo,
          .brand-line {
            display: none !important;
            visibility: hidden !important;
            opacity: 0 !important;
            width: 0 !important;
            height: 0 !important;
            max-width: 0 !important;
            max-height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
          }
        `;
        (document.head || document.documentElement).appendChild(s);
      }
    }
    injectHideStyle();
    window.addEventListener('DOMContentLoaded', injectHideStyle);
    setInterval(injectHideStyle, 400);

    // 3. Setup visual simulated mouse cursor
    function setupCursor() {
      if (document.getElementById('recording-cursor')) return;

      const cursor = document.createElement('div');
      cursor.id = 'recording-cursor';
      cursor.style.cssText = `
        position: fixed;
        top: -100px;
        left: -100px;
        width: 22px;
        height: 22px;
        border-radius: 50%;
        background: rgba(255, 68, 68, 0.75);
        border: 2.5px solid #ffffff;
        box-shadow: 0 0 8px rgba(0, 0, 0, 0.4), 0 0 16px rgba(255, 68, 68, 0.5);
        pointer-events: none;
        z-index: 2147483647;
        transform: translate(-50%, -50%);
        transition: transform 0.08s ease-out, background-color 0.12s ease;
      `;

      const dot = document.createElement('div');
      dot.style.cssText = `
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 4px;
        height: 4px;
        border-radius: 50%;
        background: #ffffff;
      `;
      cursor.appendChild(dot);
      document.documentElement.appendChild(cursor);

      window.addEventListener('mousemove', (e) => {
        cursor.style.left = `${e.clientX}px`;
        cursor.style.top = `${e.clientY}px`;
      }, { passive: true });

      window.addEventListener('mousedown', (e) => {
        cursor.style.transform = 'translate(-50%, -50%) scale(0.7)';
        cursor.style.backgroundColor = 'rgba(230, 20, 20, 0.95)';

        const ripple = document.createElement('div');
        ripple.className = 'recording-click-ripple';
        ripple.style.cssText = `
          position: fixed;
          left: ${e.clientX}px;
          top: ${e.clientY}px;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          border: 2.5px solid #ff3333;
          background: rgba(255, 51, 51, 0.25);
          pointer-events: none;
          z-index: 2147483646;
          transform: translate(-50%, -50%) scale(1);
          animation: cursor-ripple-anim 0.55s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
        `;
        document.documentElement.appendChild(ripple);
        setTimeout(() => ripple.remove(), 600);
      }, { passive: true });

      window.addEventListener('mouseup', () => {
        cursor.style.transform = 'translate(-50%, -50%) scale(1)';
        cursor.style.backgroundColor = 'rgba(255, 68, 68, 0.75)';
      }, { passive: true });

      if (!document.getElementById('recording-cursor-styles')) {
        const style = document.createElement('style');
        style.id = 'recording-cursor-styles';
        style.textContent = `
          @keyframes cursor-ripple-anim {
            0% { transform: translate(-50%, -50%) scale(0.8); opacity: 1; }
            100% { transform: translate(-50%, -50%) scale(4.5); opacity: 0; }
          }
        `;
        document.documentElement.appendChild(style);
      }
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', setupCursor);
    } else {
      setupCursor();
    }
    const observer = new MutationObserver(() => {
      removeStickearn();
      if (!document.getElementById('recording-cursor')) {
        setupCursor();
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  });

  const page = await context.newPage();
  const currentPos = { x: 960, y: 540 };

  try {
    console.log('[Step 1] Navigating to Login Page...');
    await page.goto(targetUrl, { waitUntil: 'networkidle' });
    await page.waitForSelector('#password', { state: 'visible', timeout: 15000 });
    await page.mouse.move(currentPos.x, currentPos.y);
    await sleep(1500);

    console.log('[Step 2] Authenticating with password...');
    const passwordInput = page.locator('#password');
    await smoothType(page, passwordInput, 'demoreport', currentPos, 60, 95);
    await sleep(500);

    const submitBtn = page.locator('button[type="submit"]');
    console.log('Clicking Sign in button...');
    await smoothClickLocator(page, submitBtn, currentPos, 1200);

    console.log('[Step 3] Loading Campaign Dashboard (clean header without StickEarn logo)...');
    await page.waitForURL('**/report?campaignId=*', { timeout: 20000 });
    await page.waitForLoadState('networkidle');

    // Explicit cleanup call
    await page.evaluate(() => {
      document.querySelectorAll('img[alt*="Stickearn" i], img[src*="brand_logo"], .brand-logo, .brand-line').forEach(el => el.remove());
    });

    await page.waitForSelector('.ant-tabs-tab', { state: 'visible', timeout: 15000 });
    await sleep(2000);

    console.log('[Step 4] Applying Date Filter (2025-09-05 to 2025-09-25)...');
    const startInput = page.locator('.report-filter__duration input[placeholder="Start date"]');
    const endInput = page.locator('.report-filter__duration input[placeholder="End date"]');
    const searchBtn = page.locator('button:has(.icon-search-outline)');

    // Start Date
    await smoothClickLocator(page, startInput, currentPos, 300);
    await startInput.selectText();
    for (const char of '2025-09-05') {
      await page.keyboard.type(char);
      await sleep(45);
    }
    await page.keyboard.press('Enter');
    await sleep(400);

    // End Date
    await smoothClickLocator(page, endInput, currentPos, 300);
    await endInput.selectText();
    for (const char of '2025-09-25') {
      await page.keyboard.type(char);
      await sleep(45);
    }
    await page.keyboard.press('Enter');
    await sleep(500);

    // Magnifying glass / Search button
    console.log('Clicking Magnifying Glass / Search button...');
    await smoothClickLocator(page, searchBtn, currentPos, 1500);
    await page.waitForLoadState('networkidle');
    await sleep(1800);

    // Show refreshed top summary metrics
    await moveMouseSmooth(page, currentPos, 500, 180, 20);
    await sleep(1200);

    console.log('[Step 5] Section 1: Hourly & Daily Performance charts...');
    await smoothScrollToY(page, 450, 1000);
    await sleep(600);

    // Hourly Performance chart
    const hourlyChart = page.locator('.apexcharts-canvas').nth(0);
    if (await hourlyChart.count() > 0) {
      console.log('Hovering across Average Performance / Hour chart...');
      await hoverChartPoints(page, hourlyChart, currentPos, 5, 650);
    }

    // Daily Average chart
    const dailyAvgChart = page.locator('.apexcharts-canvas').nth(1);
    if (await dailyAvgChart.count() > 0) {
      console.log('Hovering across Average Performance / Day chart...');
      await hoverChartPoints(page, dailyAvgChart, currentPos, 4, 650);
    }
    await sleep(600);

    console.log('[Step 6] Section 2: Daily Performance Breakdown...');
    await smoothScrollToY(page, 950, 1000);
    await sleep(600);

    // Daily Performance area chart
    const dailyChart = page.locator('.apexcharts-canvas').nth(2);
    if (await dailyChart.count() > 0) {
      console.log('Hovering across Daily Performance breakdown chart...');
      await hoverChartPoints(page, dailyChart, currentPos, 6, 700);
    }
    await sleep(600);

    console.log('[Step 7] Section 3: Inventory Breakdown & Sub-tabs...');
    await smoothScrollToY(page, 1450, 1000);
    await sleep(800);

    // Hover over inventory table row
    const firstTableRow = page.locator('.ant-table-row').first();
    if (await firstTableRow.count() > 0) {
      const box = await firstTableRow.boundingBox();
      if (box) {
        await moveMouseSmooth(page, currentPos, box.x + box.width * 0.35, box.y + box.height / 2, 18);
        await sleep(800);
      }
    }

    // Click Media Plan subtab
    const mediaPlanTab = page.locator('.ant-tabs-tab:visible').filter({ hasText: 'Media Plan' }).first();
    if (await mediaPlanTab.count() > 0 && await mediaPlanTab.isVisible()) {
      console.log('Clicking Media Plan subtab...');
      await smoothClickLocator(page, mediaPlanTab, currentPos, 1800);

      const inventorySubTab = page.locator('.ant-tabs-tab:visible').filter({ hasText: 'Inventory' }).first();
      console.log('Switching back to Inventory subtab...');
      await smoothClickLocator(page, inventorySubTab, currentPos, 1200);
    }

    console.log('[Step 8] Section 4: Audience Demographics with chart hovers...');
    await smoothScrollToY(page, 2050, 1000);
    await sleep(600);

    // Age Demographics chart (bar chart)
    const ageChart = page.locator('.apexcharts-canvas').nth(3);
    if (await ageChart.count() > 0) {
      console.log('Hovering across Age Demographics chart...');
      await hoverChartPoints(page, ageChart, currentPos, 5, 650);
    }

    // Gender Demographic chart (donut chart)
    const genderChart = page.locator('.apexcharts-canvas').nth(4);
    if (await genderChart.count() > 0) {
      console.log('Hovering over Gender Demographic donut slices...');
      await hoverDonutSlices(page, genderChart, currentPos, 2, 700);
    }
    await sleep(600);

    console.log('[Step 9] Section 5: Geographical Distribution with chart hovers...');
    await smoothScrollToY(page, 2550, 1000);
    await sleep(600);

    // Location charts
    const locationChart1 = page.locator('.apexcharts-canvas').nth(5);
    if (await locationChart1.count() > 0) {
      console.log('Hovering over Home Location chart...');
      await hoverDonutSlices(page, locationChart1, currentPos, 2, 650);
    }

    // Second location row
    await smoothScrollToY(page, 2900, 1000);
    await sleep(600);

    const locationChart2 = page.locator('.apexcharts-canvas').nth(7);
    if (await locationChart2.count() > 0) {
      console.log('Hovering over additional Location distribution chart...');
      await hoverDonutSlices(page, locationChart2, currentPos, 2, 650);
    }
    await sleep(600);

    console.log('[Step 10] Scrolling back to top & Documentations exploration...');
    await smoothScrollToY(page, 0, 1500);
    await sleep(800);

    // Documentations tab
    const docTab = page.locator('.ant-tabs-nav .ant-tabs-tab').filter({ hasText: 'Documentations' }).first();
    if (await docTab.count() > 0 && await docTab.isVisible()) {
      console.log('Navigating to Documentations (Proof of Performance)...');
      await smoothClickLocator(page, docTab, currentPos, 2200);

      // Return to Overview
      const overviewTab = page.locator('.ant-tabs-nav .ant-tabs-tab').filter({ hasText: 'Overview' }).first();
      console.log('Returning to Overview tab...');
      await smoothClickLocator(page, overviewTab, currentPos, 1500);
    }

    console.log('[Step 11] Final view hold...');
    await smoothScrollToY(page, 0, 600);
    await sleep(2000);

    console.log('Journey recording sequence completed successfully!');
  } catch (err) {
    console.error('Error during recording:', err);
  } finally {
    const video = page.video();
    await context.close();
    await browser.close();

    if (video) {
      const videoPath = await video.path();
      const webmDest = path.join(__dirname, 'campaign_journey_recording.webm');
      const mp4Dest = path.join(__dirname, 'campaign_journey_recording.mp4');
      fs.copyFileSync(videoPath, webmDest);

      console.log('Exporting recording to MP4 format via ffmpeg...');
      try {
        execFileSync(ffmpegPath, [
          '-i', webmDest,
          '-c:v', 'libx264',
          '-pix_fmt', 'yuv420p',
          '-preset', 'fast',
          '-crf', '20',
          '-movflags', '+faststart',
          '-y',
          mp4Dest
        ], { stdio: 'inherit' });

        console.log('====================================================');
        console.log('MP4 Video exported successfully!');
        console.log(`MP4 File: ${mp4Dest}`);
        const mp4Stats = fs.statSync(mp4Dest);
        console.log(`MP4 Size: ${(mp4Stats.size / (1024 * 1024)).toFixed(2)} MB`);
        console.log('====================================================');
      } catch (e) {
        console.error('Error during MP4 conversion:', e);
      }
    }
  }
})();
