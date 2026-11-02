// The closing wizard (2026-11-02): one screen per step, Send only on the last.
// Send is "locked" while it is not on screen or is greyed.
export const sendLocked = async page => !(await page.locator('[data-close-now]').count()) || await page.locator('[data-close-now]').isDisabled();
// "Send unlocks": walk on through every screen whose Next is open; ready = on the last screen with Send open.
export const sendReady = async page => {
  for (let i = 0; i < 12; i++) {
    if (await page.locator('[data-close-now]').count()) return !(await page.locator('[data-close-now]').isDisabled());
    const nx = page.locator('[data-close-next]');
    if (!(await nx.count()) || await nx.isDisabled()) return false;
    await nx.click(); await page.waitForTimeout(250);
  }
  return false;
};
export const waitReady = async page => { for (let i = 0; i < 40; i++) { if (await sendReady(page)) return true; await page.waitForTimeout(250); } return false; };
