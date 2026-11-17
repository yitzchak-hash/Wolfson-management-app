/**
 * NETIV'S STANDARD PLAN OF EVERY FLOOR, built in (owner, 2026-11-17: "fill in the standard plan bubbles for each
 * floor … find it in our drive … I can click to approve each one" — he approved all eleven on the approval page,
 * the AC engineer's sheet each time). The Drive folder is "PDF מקבלן" › "בנין 1" / "בנין 2".
 *
 * These are what a floor's bubble opens when the office has not chosen a plan of its own for it. A plan picked in
 * the app (BoardSetting.standardPlansByFloor / standardPlans) always wins, so nothing here is written to the
 * database and nothing chosen by hand is ever replaced.
 *
 * The sheets' floors run one under the app's from 3 up: "Floor 2-7" is the app's 3–8, "Floor 8" its 9, "Floor 9"
 * its 10. Building 1 has no sheet of its own for its top typical floor, so its 3–8 share one; Building 2's 8 has
 * its own ("Floor 7").
 */
import type { StandardPlan } from '../../types';

const pdf = (fileId: string, name: string): StandardPlan => ({ fileId, name, mimeType: 'application/pdf' });
const many = (floors: number[], p: StandardPlan) => Object.fromEntries(floors.map(f => [String(f), p]));

const NETIV: Record<string, Record<string, StandardPlan>> = {
  B1: {
    '0': pdf('1kntb75M010G5JRhxJBVpaMtBhSD0jRWT', 'Building 1 -Floor 0.pdf'),
    '1': pdf('1QUpk1xsMq7NAVPyDhuhKMDAqAGQRLTDu', 'Building 1- Floor 1.pdf'),
    ...many([3, 4, 5, 6, 7, 8], pdf('1wRwpsJtIrgoezXxS_6CSqL1WHq3T0X1h', 'Building 1- Floor 2-7.pdf')),
    '9': pdf('1Pj9kRnTkkJo634jD_TGqAw-qghGDodOI', 'Building 1- Floor 8.pdf'),
    '10': pdf('1YAmuJ53cT1_FSn0xgCcsYyAH1B1ZG528', 'Building 1- Floor 9.pdf'),
  },
  B2: {
    '0': pdf('1-jHWIMvksfJpUCEj4ib3_uyVhINOIUee', 'Building 2- Floor 0.pdf'),
    '1': pdf('172HyKxQ3Hgv7h4b_111_NSE7nvmUC6Mo', 'Building 2-Floor 1.pdf'),
    ...many([3, 4, 5, 6, 7], pdf('1b-qk_-pcDxZJctpjscdhkUkxKDd69EvE', 'Building 2- Floor 2-7.pdf')),
    '8': pdf('1jBhfOa6_9M3XNvLzOPEw6ijUZTn-Wk7n', 'Building 2- Floor 7.pdf'),
    '9': pdf('174NLofovW6MY3Csrv0E3No3vBa6vbiBQ', 'Building 2- Floor 8.pdf'),
    '10': pdf('1NNCWfPp3LjmIgXG8xeq1O2W1y-DaXqxl', 'Building 2- Floor 9.pdf'),
  },
};

/** The built-in plan of one floor, when the workspace has one. */
export function builtInStandardPlan(projectId: string, buildingId: string, floorKey: string): StandardPlan | undefined {
  return projectId === 'netiv' ? NETIV[buildingId]?.[floorKey] : undefined;
}
