import React from 'react';
import {
  Globe2, Flame, Images, Rows3, Trophy, Disc3, Grid3x3, PartyPopper, Calculator,
  Fingerprint, Map as MapIcon, CloudSun, Music2, Building2,
} from 'lucide-react';
import { UnitCard } from '../components/board/UnitCard';
import { WidgetDef } from './widgets';
import { WorldClocks, ShabbatClock } from '../components/board/TimeWidgets';
import { BeforeAfter, SplitFlap, CrewRace } from '../components/board/TactileWidgets';
import { StreakFlame, SpinWheel, BubbleWrap, Celebrate, BtuHp } from '../components/board/DelightWidgets';
import { TapInBoard } from '../components/board/TapInBoard';
import { MapWidget } from '../components/board/MapWidget';
import { WeatherWidget } from '../components/board/WeatherWidget';
import { TikTokWidget } from '../components/board/TikTokWidget';
import { PhotosAlbumWidget } from '../components/board/PhotosAlbumWidget';

/**
 * The widgets whose render is a real component rather than a few lines.
 *
 * Registered here for the same reason the wall ones are: they import `Frame`
 * and the data helpers out of `widgets.tsx`, so the array has to be pushed on
 * after that file has finished defining them rather than sitting inside it.
 */
export const MORE_WIDGETS: WidgetDef[] = [
  {
    /**
     * One apartment from another workspace, standing on this board — the
     * board twin of the notebook's cross-workspace entry. Mostly created by
     * DROPPING a unit out of a Building Progress square onto the board, but
     * placeable from the store too. A pointer, never a copy: clicking it
     * travels to that workspace and opens the unit.
     */
    id: 'unit-card', rank: 19, name: 'Unit card', category: 'live',
    icon: Building2, w: 220, h: 96,
    blurb: 'One apartment from another workspace. Click it to travel there and open it.',
    data: {},
    render: (el, c) => <UnitCard el={el} c={c} />,
  },
  {
    id: 'world-clocks', rank: 20, name: 'World clocks', category: 'live',
    icon: Globe2, w: 210, h: 165,
    blurb: 'What time it is where your suppliers are, and whether anybody is at a desk.',
    data: { cities: ['il', 'ny', 'lon', 'sha'], workStart: 9, workEnd: 17 },
    render: (el) => <WorldClocks el={el} />,
  },
  {
    id: 'shabbat-clock', rank: 21, name: 'Shabbat clock', category: 'live',
    icon: Flame, w: 260, h: 140,
    blurb: 'Candle lighting, havdalah, and how long before the last van has to leave.',
    data: { placeId: 'telaviv', vanBuffer: 90 },
    render: (el) => <ShabbatClock el={el} />,
  },
  {
    id: 'before-after', rank: 22, name: 'Before and after', category: 'live',
    icon: Images, w: 250, h: 190,
    blurb: 'Two photos of one job with a divider you drag between them.',
    data: { split: 50 },
    render: (el, c) => <BeforeAfter el={el} c={c} />,
  },
  {
    id: 'split-flap', rank: 23, name: 'Split-flap board', category: 'visual',
    icon: Rows3, w: 280, h: 90,
    blurb: 'Airport letters that physically flip. Fix the words, or bind it to a live figure.',
    data: { source: 'text', text: 'TZVIAIR', size: 22 },
    render: (el, c) => <SplitFlap el={el} c={c} />,
  },
  {
    id: 'crew-race', rank: 24, name: 'Crew race', category: 'live',
    icon: Trophy, w: 240, h: 180,
    blurb: 'A van each, driving toward the finish as tasks get closed.',
    data: { days: 7 },
    render: (el, c) => <CrewRace el={el} c={c} />,
  },
  {
    id: 'streak-flame', rank: 25, name: 'Streak', category: 'live',
    icon: Flame, w: 185, h: 105,
    blurb: 'How many days running something has been finished. Breaks if a day goes by empty.',
    data: {},
    render: (el, c) => <StreakFlame el={el} c={c} />,
  },
  {
    id: 'spin-wheel', rank: 26, name: 'Spin the wheel', category: 'visual',
    icon: Disc3, w: 230, h: 130,
    blurb: 'Who takes the job nobody wants. Settles it in three seconds.',
    data: {},
    render: (el, c) => <SpinWheel el={el} c={c} />,
  },
  {
    id: 'bubble-wrap', rank: 27, name: 'Bubble wrap', category: 'visual',
    icon: Grid3x3, w: 200, h: 155,
    blurb: 'Bubble wrap. Drag across it. That is the whole thing.',
    data: { cols: 10, rows: 7, popped: [] },
    render: (el, c) => <BubbleWrap el={el} c={c} />,
  },
  {
    id: 'celebrate', rank: 28, name: 'Celebrate', category: 'visual',
    icon: PartyPopper, w: 185, h: 110,
    blurb: 'A button that throws confetti. For when a building tops out.',
    data: { label: '🎉 Nice one' },
    render: (el, c) => <Celebrate el={el} c={c} />,
  },
  {
    id: 'tap-in', rank: 3, name: 'Tap in', category: 'live',
    icon: Fingerprint, w: 300, h: 200,
    blurb: 'Big name tiles people press on arrival. Lit tiles are who is here right now.',
    data: { cols: 3 },
    render: (el, c) => <TapInBoard el={el} c={c} />,
  },
  {
    id: 'job-map', rank: 5, name: 'Map', category: 'live',
    icon: MapIcon, w: 340, h: 260,
    blurb: 'A real street map with every job on it, placed from the address already typed on the job.',
    data: {},
    render: (el, c) => <MapWidget el={el} c={c} />,
  },
  {
    id: 'weather', rank: 19, name: 'Weather', category: 'live',
    icon: CloudSun, w: 250, h: 130,
    blurb: 'Five days for the site. The one widget that uses the internet — rain decides the week.',
    data: { placeId: 'telaviv' },
    render: (el, c) => <WeatherWidget el={el} c={c} />,
  },
  {
    /**
     * A shared Google Photos album, wearing its own cover picture. A pointer
     * at the album, never a copy of it — clicking opens Google Photos.
     */
    id: 'photos-album', rank: 6, name: 'Google Photos album', category: 'live',
    icon: Images, w: 250, h: 200,
    blurb: 'Paste a shared album link and the board wears its cover. Click it to open the album.',
    data: {},
    render: (el, c) => <PhotosAlbumWidget el={el} c={c} />,
  },
  {
    id: 'tiktok', rank: 29, name: 'TikTok reel', category: 'visual',
    icon: Music2, w: 260, h: 400,
    blurb: 'Paste a list of links and it plays through them. Shuffle, and move on by itself.',
    data: { seconds: 30, auto: true },
    render: (el, c) => <TikTokWidget el={el} c={c} />,
  },
  {
    id: 'btu-hp', rank: 18, name: 'BTU and horsepower', category: 'plan',
    icon: Calculator, w: 235, h: 150,
    blurb: 'BTU/hr, both horsepowers, tons and kW at once — the two HPs are not the same number.',
    data: { unit: 'btu', value: '24000' },
    render: (el, c) => <BtuHp el={el} c={c} />,
  },
];
