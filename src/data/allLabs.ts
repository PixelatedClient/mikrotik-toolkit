import { LABS, type Lab } from './labs';
import { LESSON_TOPOLOGIES } from './lessonLabs';

/** Every lab topology: the GNS3 catalogue plus the browser-only labs written for lessons. */
export const findLab = (id: string): Lab | undefined => LABS.find((l) => l.id === id) ?? LESSON_TOPOLOGIES.find((l) => l.id === id);
