// Vowel Formant Data (Approximate for Male Voice)
// F1 (Tongue Height), F2 (Tongue Backness)
export interface Vowel {
    name: string;
    f1: number;
    f2: number;
    f3: number;
}

export const VOWELS: Record<string, Vowel> = {
    IY: { name: "iy", f1: 270, f2: 2290, f3: 3010 }, // beet
    IH: { name: "ih", f1: 390, f2: 1990, f3: 2550 }, // bit
    EH: { name: "eh", f1: 530, f2: 1840, f3: 2480 }, // bet
    AE: { name: "ae", f1: 660, f2: 1720, f3: 2410 }, // bat
    AH: { name: "ah", f1: 730, f2: 1090, f3: 2440 }, // father
    AO: { name: "ao", f1: 570, f2: 840, f3: 2410 }, // bought
    UH: { name: "uh", f1: 440, f2: 1020, f3: 2240 }, // book
    UW: { name: "uw", f1: 300, f2: 870, f3: 2240 }, // boot
    ER: { name: "er", f1: 490, f2: 1350, f3: 1690 }, // bird
};

export class VowelSpace {
    // Interpolate formants based on 2D position
    // x: 0 (Back) -> 1 (Front) [F2]
    // y: 0 (Close) -> 1 (Open) [F1]

    static getFormants(x: number, y: number): { f1: number, f2: number, f3: number } {
        // Simple bilinear interpolation between 4 corner vowels would be naive.
        // Instead, let's map X/Y directly to F1/F2 ranges.

        // F1 Range: 250Hz (Close) to 850Hz (Open)
        // F2 Range: 800Hz (Back) to 2400Hz (Front)

        // Y maps to F1 (Openness)
        // 0 = Close (Low F1), 1 = Open (High F1)
        const f1 = 250 + (y * 600);

        // X maps to F2 (Backness)
        // 0 = Back (Low F2), 1 = Front (High F2)
        const f2 = 800 + (x * 1600);

        // F3 usually tracks F2 but higher, or is static. 
        // Let's make it dynamic for realism.
        const f3 = 2200 + (x * 500);

        return { f1, f2, f3 };
    }

    static getNearestVowel(f1: number, f2: number): string {
        let minDist = Infinity;
        let nearest = "";

        for (const [, v] of Object.entries(VOWELS)) {
            const dist = Math.sqrt(Math.pow(v.f1 - f1, 2) + Math.pow(v.f2 - f2, 2));
            if (dist < minDist) {
                minDist = dist;
                nearest = v.name;
            }
        }
        return nearest;
    }
}
