import {
  createBrowser, createPage, createCheck, createTestDiscussion,
  apiFetch, apiPatchJson, apiDeleteJson, fetchTestUser,
  BASE_URL,
} from '../../.pianotell/tests/ux/helpers.mjs';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const COOKIE = process.env.PIANOTELL_FLARUM_UX_COOKIE;
if (!BASE_URL || !COOKIE) {
  console.error('PIANOTELL_FLARUM_UX_BASE_URL and PIANOTELL_FLARUM_UX_COOKIE must be set.');
  process.exit(2);
}

const failures = [];
const check = createCheck(failures);

/**
 * Get the first post ID from a discussion via API.
 */
async function getFirstPostId(discussionId) {
  const data = await apiFetch(`/discussions/${discussionId}`, COOKIE);
  const posts = data.data?.relationships?.posts?.data;
  if (!posts || posts.length === 0) throw new Error(`No posts in discussion ${discussionId}`);
  return posts[0].id;
}

/**
 * Hide (soft-delete) a post via Flarum API.
 */
async function hidePost(postId) {
  return apiPatchJson(`/posts/${postId}`, {
    data: { attributes: { isHidden: true } },
  }, COOKIE);
}

/**
 * Restore a hidden post via Flarum API.
 */
async function restorePost(postId) {
  return apiPatchJson(`/posts/${postId}`, {
    data: { attributes: { isHidden: false } },
  }, COOKIE);
}

(async () => {
  console.log('hidden-post spec');

  const { id: userId } = await fetchTestUser();
  const sigText = `Hidden-post test sig ${Date.now()}`;

  // Ensure the user has a signature
  await apiPatchJson(`/users/${userId}`, {
    data: { attributes: { signature: sigText } },
  }, COOKIE);

  const discussionId = await createTestDiscussion(
    `Hidden Post Test ${Date.now()}`,
    'Post body for hidden-post test.',
    [],
    COOKIE
  );
  const postId = await getFirstPostId(discussionId);

  const { browser, context } = await createBrowser(COOKIE);
  const page = await createPage(context);

  try {
    // --- Signature visible on normal post ---
    await page.goto(`${BASE_URL}/d/${discussionId}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.PostStream', { timeout: 15_000 });
    await page.waitForTimeout(1000);

    const sigBefore = await page.locator('.Post-signature .Signature-content').first().textContent().catch(() => null);
    check('Signature visible on normal post', !!sigBefore && sigBefore.includes(sigText),
      `text=${JSON.stringify(sigBefore)}`);

    // --- Hide the post via API ---
    await hidePost(postId);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('.PostStream', { timeout: 15_000 });
    await page.waitForTimeout(1000);

    // Post body should be collapsed / show "deleted" message
    const hiddenPost = page.locator('.Post').first();
    const hasHiddenClass = await hiddenPost.evaluate(
      el => el.classList.contains('Post--hidden')
    ).catch(() => false);
    check('Post has Post--hidden class after hide', hasHiddenClass);

    // Signature must NOT be visible on the hidden post
    const sigAfterHide = await page.locator('.Post--hidden .Post-signature').count();
    check('Signature hidden on deleted post', sigAfterHide === 0,
      `found ${sigAfterHide} .Post-signature elements inside .Post--hidden`);

    // --- Expand hidden post to reveal content ---
    await page.locator('.Post--hidden .Button--more').first().click();
    await page.waitForTimeout(1000);

    const hasRevealClass = await hiddenPost.evaluate(
      el => el.classList.contains('revealContent')
    ).catch(() => false);
    check('Post has revealContent class after expand', hasRevealClass);

    const sigAfterExpand = await page.locator('.Post--hidden.revealContent .Post-signature').count();
    check('Signature visible when hidden post expanded', sigAfterExpand === 1,
      `found ${sigAfterExpand} .Post-signature elements inside expanded hidden post`);

    // --- Restore the post ---
    await restorePost(postId);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('.PostStream', { timeout: 15_000 });
    await page.waitForTimeout(1000);

    const sigAfterRestore = await page.locator('.Post-signature .Signature-content').first().textContent().catch(() => null);
    check('Signature visible again after restore', !!sigAfterRestore && sigAfterRestore.includes(sigText),
      `text=${JSON.stringify(sigAfterRestore)}`);

    check('No JS errors', page._uxErrors.length === 0,
      page._uxErrors.length > 0 ? page._uxErrors.join('; ') : undefined);
  } finally {
    // Cleanup: clear signature and delete discussion
    await apiPatchJson(`/users/${userId}`, {
      data: { attributes: { signature: '' } },
    }, COOKIE);
    await apiDeleteJson(`/discussions/${discussionId}`, COOKIE).catch(() => {});
    await browser.close();
  }

  if (failures.length) {
    console.log(`\n${failures.length} check(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll checks passed.');
})();
