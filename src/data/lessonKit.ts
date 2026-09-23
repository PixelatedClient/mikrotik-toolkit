/**
 * What comes after the text of a lesson: a lab, a quiz and a troubleshooting incident.
 * The lab list grows with the lesson (each lab builds on the one before), and incidents from the old NOC section live
 * with the lesson that teaches the skill. tests/lessonkit.test.ts checks every reference resolves.
 */
export type Level = 'Beginner' | 'Associate' | 'Professional';

export interface QuizQuestion {
  q: string;
  options: string[];
  /** Zero-based index of the right option. */
  answer: number;
  explain: string;
}

export interface LessonKit {
  /** Content entry id, e.g. "foundations/06-dns-and-dhcp". */
  lesson: string;
  level: Level;
  /** Browser lab ids (from simLabs.ts), easiest first. */
  labs?: string[];
  /** GNS3 labs (labs.ts ids) for topics the browser simulator cannot run yet. */
  gns3Labs?: string[];
  quiz?: QuizQuestion[];
  /** NOC incident ids (nocIncidents.ts) that practise troubleshooting this topic. */
  incidents?: string[];
}

import { FOUNDATIONS_KITS } from './kits/foundations';
import { LAYER2_KITS } from './kits/layer2';
import { MIKROTIK_KITS } from './kits/mikrotik';
import { ROUTING_KITS } from './kits/routing';
import { ISP_KITS } from './kits/isp';
import { DESIGN_KITS } from './kits/design';
import { CONFIG_KITS } from './kits/config';
import { SECURITY_KITS } from './kits/security';
import { AUTOMATION_KITS } from './kits/automation';
import { IPV6_WIRELESS_KITS } from './kits/ipv6-wireless';
import { CLOUD_DC_KITS } from './kits/cloud-dc';
import { MPLS_KITS } from './kits/mpls';

export const KITS: LessonKit[] = [...FOUNDATIONS_KITS, ...LAYER2_KITS, ...MIKROTIK_KITS, ...ROUTING_KITS, ...ISP_KITS, ...DESIGN_KITS, ...CONFIG_KITS, ...SECURITY_KITS, ...AUTOMATION_KITS, ...IPV6_WIRELESS_KITS, ...CLOUD_DC_KITS, ...MPLS_KITS];

export const kitFor = (lesson: string): LessonKit | undefined => KITS.find((k) => k.lesson === lesson);

/** The lesson that teaches with this browser lab (a lab can appear in more than one; the first is the home). */
export const lessonForLab = (labId: string): string | undefined => KITS.find((k) => k.labs?.includes(labId))?.lesson;
export const lessonForGns3Lab = (labId: string): string | undefined => KITS.find((k) => k.gns3Labs?.includes(labId) || k.labs?.includes(labId))?.lesson;
export const lessonForIncident = (id: string): string | undefined => KITS.find((k) => k.incidents?.includes(id))?.lesson;
