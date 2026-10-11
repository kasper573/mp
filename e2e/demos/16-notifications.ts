import { test, type Page } from "@playwright/test";

import { provisionAccount, signIn } from "../helpers/account";
import { playAs } from "../helpers/character";
import { caption, chapter } from "../helpers/demo";
import {
  arrivedIn,
  clickUi,
  closestTile,
  doubleClickUi,
  focusGame,
  historyTab,
  holding,
  hoverUi,
  nearest,
  probe,
  travelTo,
  waitFor,
  waitForWorld,
  walkInto,
  walkTo,
  type Snapshot,
} from "../helpers/game";
import { loadReference } from "../helpers/image";
import { conversationOver, onStage, pick, readToChoices, talkTo } from "../helpers/talk";

const BAG = "icons/equipment/bag.png";
const HELMET = "icons/equipment/leather_helmet.png";
const CUTLASS = "icons/weapon_and_tool/golden_sword.png";

test(
  "Notifications",
  chapter({
    summary: "Every notification where it belongs: bubbles, captions, alerts, errors, milestones and intros",
    setup: async (page) => {
      await playAs(page, "forest_bound");
      await signIn(page, await provisionAccount(page));
      await waitForWorld(page, loadReference("island.png"));
    },
    play: async (page) => {
      await caption(page, "Some places speak up on their own: Ilsa watches the forest road");
      const road = (await probe(page)).portals.find((portal) => portal.name === "forest-road")!;
      await travelTo(page, road.at);
      await waitFor(page, ({ history }) => history.records.some((record) => record.by === "Ilsa" && record.text.startsWith("Halt!")), "Ilsa never called out");
      await caption(page, "Without a pass the road is just ground. Come near, and she calls out over her head", { at: "top" });
      await page.waitForTimeout(2500);
      await caption(page, "Ilsa shows only what she means to: the road opens at level 3", { at: "top" });
      await talkTo(page, "ilsa");
      await readToChoices(page, 1400);
      await hoverUi(page, "I'm ready for the forest road.");
      await page.waitForTimeout(2500);
      await pick(page, "Never mind.");
      await conversationOver(page);

      await caption(page, "Talk to her, though, and a fish changes her mind");
      await talkTo(page, "ilsa");
      await readToChoices(page, 1000);
      await hoverUi(page, "Would a fish change your mind?");
      await page.waitForTimeout(2000);
      await pick(page, "Would a fish change your mind?");
      await onStage(page, "fish");
      await waitFor(page, ({ feed }) => feed.includes("+1 Road Pass"), "the pass never showed in the feed");
      await caption(page, "The trade shows in the corner, over her bust: the fish goes, the pass arrives", { at: "top" });
      await readToChoices(page, 1800);
      await pick(page, "Enjoy it.");
      await conversationOver(page);
      await waitFor(page, (snapshot) => holding(snapshot, "road_pass") === 1, "the pass never arrived");

      await caption(page, "Narration plays as captions at the top and never blocks: gulls squabble at the pier");
      // With the pass in the bag the road would take us now, so the way to the pier keeps clear of it.
      await travelTo(page, [road.at[0], road.at[1] + 3]);
      await walkInto(page, "ferry-pier");
      await waitFor(page, (snapshot) => captioned(snapshot, "Gulls"), "the gulls never squabbled");
      await page.waitForTimeout(1000);
      await caption(page, "Hovering holds the captions, so you can finish reading", { at: "top" });
      await hoverUi(page, /squabble/);
      await page.waitForTimeout(3500);
      await caption(page, "Every line is kept in history as well — H shows it", { at: "top" });
      await focusGame(page);
      await page.keyboard.press("KeyH");
      await waitFor(page, ({ history }) => history.open, "history never opened");
      await page.waitForTimeout(3000);
      await page.keyboard.press("KeyH");
      await waitFor(page, ({ history }) => !history.open, "history never closed");

      await caption(page, "What you can't do is an error, in red at the top: the Tribal Helmet wants level 3");
      await clickUi(page, BAG);
      await doubleClickUi(page, HELMET);
      await waitFor(page, (snapshot) => refused(snapshot, "Tribal Helmet"), "the helmet was never refused");
      await page.waitForTimeout(1500);
      await caption(page, "Only the latest error shows: the Corsair's Cutlass wants level 3 too", { at: "top" });
      await doubleClickUi(page, CUTLASS);
      await waitFor(page, (snapshot) => refused(snapshot, "Corsair's Cutlass"), "the cutlass never replaced the helmet");
      await page.waitForTimeout(1500);
      await caption(page, "Trying again keeps that one error up, with nothing piling on", { at: "top" });
      await doubleClickUi(page, CUTLASS);
      await page.waitForTimeout(1500);
      await caption(page, "Errors it replaced are kept in history", { at: "top" });
      await focusGame(page);
      await page.keyboard.press("KeyH");
      await waitFor(page, ({ history }) => history.open, "history never opened");
      await openTab(page, "Errors");
      await waitFor(
        page,
        ({ history }) => history.records.filter(({ topic }) => topic === "Error").length >= 2,
        "history never kept both errors",
      );
      await page.waitForTimeout(3000);
      await focusGame(page);
      await page.keyboard.press("KeyH");
      await waitFor(page, ({ history }) => !history.open, "history never closed");
      await page.keyboard.press("KeyI");

      await caption(page, "Bram sails for twenty Gold, or for a pass he only needs to see");
      await talkTo(page, "bram");
      await readToChoices(page, 1000);
      await hoverUi(page, "Ilsa gave me this pass.");
      await page.waitForTimeout(2500);
      await pick(page, "Ilsa gave me this pass.");
      await waitFor(page, (snapshot) => arrivedIn(snapshot, "forest"), "the Gull never sailed");
      await caption(page, "The crossing narrates itself while you walk on", { at: "top" });
      await waitFor(page, (snapshot) => captioned(snapshot, "The Gull"), "the crossing was never told");
      await stroll(page, [3, 1]);
      await caption(page, "A first visit opens on the area's own title, to its own drums", { at: "top" });
      await waitFor(page, ({ notifications }) => notifications.intro?.title === "The forest", "the forest never spoke", 15_000);
      await stroll(page, [-2, 2]);
      await page.waitForTimeout(3000);

      await caption(page, "The orcs here are worth experience, and one more brings a new level: a milestone, in the middle of the screen");
      await fightUntil(page, "orc", (snapshot) => milestone(snapshot, "Level up"), 120_000);
      await page.waitForTimeout(3000);

      await caption(page, "You're on Mara's errand, and the forest's chiefs know it: come near one and he has words for you", {
        at: "top",
      });
      // A chief taunts once and then holds his tongue for a while, so one that wandered past earlier
      // has already had his say; the bubble is captioned only while it is up.
      const taunted = (snapshot: Snapshot) =>
        yelled(snapshot, "orc_chief") || snapshot.history.records.some((record) => record.by === "Orc Chief");
      await travelTo(page, (snapshot) => chief(snapshot)?.aim, 120_000, taunted);
      await waitFor(page, taunted, "the Orc Chief never yelled");
      if (yelled(await probe(page), "orc_chief")) {
        await caption(page, "Voices speak from where they stand: a bubble over the chief, in his own voice");
        await page.waitForTimeout(2500);
      }
      await caption(page, "You keep fighting: no tether, no lock, and your foe's bubble stays up front");
      await fight(page, "orc_chief", 9000);
      await page.waitForTimeout(1500);
    },
  }),
);

function captioned({ notifications }: Snapshot, label: string): boolean {
  return notifications.captions.rows.some((row) => row.label === label);
}

function milestone({ notifications }: Snapshot, label: string): boolean {
  return notifications.milestones.rows.some((row) => row.label === label);
}

function yelled({ notifications }: Snapshot, npc: string): boolean {
  return notifications.bubbles.some((bubble) => bubble.npc === npc);
}

function chief({ me, actors }: Snapshot) {
  return me ? nearest(actors.filter((actor) => actor.npc === "orc_chief" && actor.health > 0), me.at) : undefined;
}

async function fightUntil(page: Page, npc: string, done: (snapshot: Snapshot) => boolean, forMs: number): Promise<void> {
  const until = Date.now() + forMs;
  while (Date.now() < until) {
    if (done(await probe(page))) return;
    const foe = ({ me, actors }: Snapshot) =>
      me ? nearest(actors.filter((actor) => actor.npc === npc && actor.health > 0), me.at)?.aim : undefined;
    await travelTo(page, foe, 10_000, done).catch(() => undefined);
    await page.waitForTimeout(500);
  }
  throw new Error(`fighting ${npc} never got there`);
}

function refused({ notifications }: Snapshot, item: string): boolean {
  return notifications.error?.startsWith(item) ?? false;
}

async function openTab(page: Page, title: string): Promise<void> {
  const tab = await historyTab(page, title);
  await clickUi(page, (element) => element.text === tab.text && element.x === tab.x && element.y === tab.y);
  await waitFor(page, ({ history }) => history.tab === title, `the ${title} tab never opened`);
}

async function stroll(page: Page, [dx, dy]: [number, number]): Promise<void> {
  const { me, walkable } = await probe(page);
  await walkTo(page, closestTile(walkable, [me!.at[0] + dx, me!.at[1] + dy])!);
}

async function fight(page: Page, npc: string, forMs: number): Promise<void> {
  const until = Date.now() + forMs;
  while (Date.now() < until) {
    const foe = ({ me, actors }: Snapshot) =>
      me ? nearest(actors.filter((actor) => actor.npc === npc && actor.health > 0), me.at)?.aim : undefined;
    await travelTo(page, foe).catch(() => undefined);
    await page.waitForTimeout(1500);
  }
}
