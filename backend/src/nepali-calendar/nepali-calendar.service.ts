import { Injectable } from '@nestjs/common';
import NepaliDate from 'nepali-date-converter';

export interface NepaliDateInfo {
  yearBS: number;
  monthBS: number; // 1 - 12
  dayBS: number; // 1 - 32
  monthNameBS: string; // e.g. "Bhadra"
  dayNameBS: string; // e.g. "Saturday"
  nepaliFormatted: string; // e.g. "2083 Bhadra 6"
  nepaliFullFormatted: string; // e.g. "2083 Bhadra 6, Saturday"
  adDateString: string; // YYYY-MM-DD
}

// Standard Bikram Sambat days in month mapping (2000 - 2100 BS)
export const BS_MONTH_DAYS: Record<number, number[]> = {
  2000: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2001: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2002: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2003: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2004: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2005: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2006: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2007: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2008: [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 29, 31],
  2009: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2010: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2011: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2012: [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 30, 30],
  2013: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2014: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2015: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2016: [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 30, 30],
  2017: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2018: [31, 32, 31, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2019: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2020: [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30],
  2021: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2022: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30],
  2023: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2024: [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30],
  2025: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2026: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2027: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2028: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2029: [31, 31, 32, 31, 32, 30, 30, 29, 30, 29, 30, 30],
  2030: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2031: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2032: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2033: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2034: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2035: [30, 32, 31, 32, 31, 31, 29, 30, 30, 29, 29, 31],
  2036: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2037: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2038: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2039: [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 30, 30],
  2040: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2041: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2042: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2043: [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 30, 30],
  2044: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2045: [31, 32, 31, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2046: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2047: [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30],
  2048: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2049: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30],
  2050: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2051: [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30],
  2052: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2053: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30],
  2054: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2055: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2056: [31, 31, 32, 31, 32, 30, 30, 29, 30, 29, 30, 30],
  2057: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2058: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2059: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2060: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2061: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2062: [30, 32, 31, 32, 31, 31, 29, 30, 29, 30, 29, 31],
  2063: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2064: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2065: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2066: [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 29, 31],
  2067: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2068: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2069: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2070: [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 30, 30],
  2071: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2072: [31, 32, 31, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2073: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2074: [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30],
  2075: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2076: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30],
  2077: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2078: [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30],
  2079: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2080: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30],
  2081: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2082: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2083: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2084: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2085: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2086: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2087: [31, 31, 32, 31, 31, 31, 30, 30, 29, 30, 30, 30],
  2088: [30, 31, 32, 32, 30, 31, 30, 30, 29, 30, 30, 30],
  2089: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 30, 30],
  2090: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 30, 30],
  2091: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2092: [31, 31, 32, 32, 31, 30, 30, 30, 29, 29, 30, 30],
  2093: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2094: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2095: [31, 31, 32, 32, 31, 30, 30, 30, 29, 29, 30, 30],
  2096: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2097: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2098: [31, 31, 32, 32, 31, 30, 30, 30, 29, 29, 30, 30],
  2099: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2100: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
};

export const NEPALI_MONTH_NAMES = [
  'Baisakh',
  'Jestha',
  'Asar',
  'Shrawan',
  'Bhadra',
  'Ashwin',
  'Kartik',
  'Mangsir',
  'Poush',
  'Magh',
  'Falgun',
  'Chaitra',
];

export const NEPALI_DAYS_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

@Injectable()
export class NepaliCalendarService {
  /**
   * Return digits in standard English format
   */
  toNepaliDigits(input: number | string): string {
    return String(input);
  }

  /**
   * Convert AD Date to BS Nepali Date
   */
  adToBs(date: Date = new Date()): NepaliDateInfo {
    try {
      const nd = new NepaliDate(date);
      const bsYear = nd.getYear();
      const bsMonth = nd.getMonth() + 1; // 1 - 12
      const bsDay = nd.getDate();

      const dayOfWeek = date.getDay();
      const monthNameBS = NEPALI_MONTH_NAMES[bsMonth - 1] || 'Baisakh';
      const dayNameBS = NEPALI_DAYS_NAMES[dayOfWeek] || 'Sunday';

      const nepaliFormatted = `${bsYear} ${monthNameBS} ${bsDay}`;
      const nepaliFullFormatted = `${nepaliFormatted}, ${dayNameBS}`;

      const pad = (n: number) => String(n).padStart(2, '0');
      const adDateString = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

      return {
        yearBS: bsYear,
        monthBS: bsMonth,
        dayBS: bsDay,
        monthNameBS,
        dayNameBS,
        nepaliFormatted,
        nepaliFullFormatted,
        adDateString,
      };
    } catch {
      // Fallback calculation for dates outside 2000-2090 using BS_MONTH_DAYS reference
      const REF_BS_YEAR = 2075;
      const REF_AD_TIME = new Date(2018, 3, 14).getTime(); // 2075-01-01 BS = 2018-04-14 AD
      const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      let diffDays = Math.round((d.getTime() - REF_AD_TIME) / (1000 * 60 * 60 * 24));

      let bsYear = REF_BS_YEAR;
      let bsMonth = 1;
      let bsDay = 1;

      if (diffDays >= 0) {
        while (diffDays > 0) {
          const daysInMonth = BS_MONTH_DAYS[bsYear]?.[bsMonth - 1] ?? 30;
          if (diffDays >= daysInMonth) {
            diffDays -= daysInMonth;
            bsMonth++;
            if (bsMonth > 12) {
              bsYear++;
              bsMonth = 1;
            }
          } else {
            bsDay += diffDays;
            diffDays = 0;
          }
        }
      } else {
        while (diffDays < 0) {
          bsMonth--;
          if (bsMonth < 1) {
            bsYear--;
            bsMonth = 12;
          }
          const daysInMonth = BS_MONTH_DAYS[bsYear]?.[bsMonth - 1] ?? 30;
          diffDays += daysInMonth;
        }
        bsDay += diffDays;
      }

      const dayOfWeek = d.getDay();
      const monthNameBS = NEPALI_MONTH_NAMES[bsMonth - 1] || 'Baisakh';
      const dayNameBS = NEPALI_DAYS_NAMES[dayOfWeek] || 'Sunday';

      const nepaliFormatted = `${bsYear} ${monthNameBS} ${bsDay}`;
      const nepaliFullFormatted = `${nepaliFormatted}, ${dayNameBS}`;

      const pad = (n: number) => String(n).padStart(2, '0');
      const adDateString = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

      return {
        yearBS: bsYear,
        monthBS: bsMonth,
        dayBS: bsDay,
        monthNameBS,
        dayNameBS,
        nepaliFormatted,
        nepaliFullFormatted,
        adDateString,
      };
    }
  }

  /**
   * Convert BS Date (yearBS, monthBS, dayBS) to AD Date
   */
  bsToAd(yearBS: number, monthBS: number, dayBS: number): Date {
    try {
      const nd = new NepaliDate(yearBS, monthBS - 1, dayBS);
      return nd.toJsDate();
    } catch {
      // Fallback calculation using reference
      const REF_BS_YEAR = 2075;
      const REF_AD_TIME = new Date(2018, 3, 14).getTime();
      let totalDays = 0;

      if (yearBS >= REF_BS_YEAR) {
        for (let y = REF_BS_YEAR; y < yearBS; y++) {
          const monthDays = BS_MONTH_DAYS[y] || [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30];
          totalDays += monthDays.reduce((acc, curr) => acc + curr, 0);
        }
        const curYearMonths = BS_MONTH_DAYS[yearBS] || [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30];
        for (let m = 1; m < monthBS; m++) {
          totalDays += curYearMonths[m - 1];
        }
        totalDays += dayBS - 1;
      } else {
        for (let y = REF_BS_YEAR - 1; y >= yearBS; y--) {
          const monthDays = BS_MONTH_DAYS[y] || [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30];
          totalDays -= monthDays.reduce((acc, curr) => acc + curr, 0);
        }
        const curYearMonths = BS_MONTH_DAYS[yearBS] || [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30];
        for (let m = 1; m < monthBS; m++) {
          totalDays += curYearMonths[m - 1];
        }
        totalDays += dayBS - 1;
      }

      const adTime = REF_AD_TIME + totalDays * 24 * 60 * 60 * 1000;
      return new Date(adTime);
    }
  }

  /**
   * Get Current Nepali Today's Date info
   */
  getCurrentNepaliDate(): NepaliDateInfo {
    return this.adToBs(new Date());
  }

  /**
   * Format Month-Year in BS (e.g. "2083 Bhadra")
   */
  formatMonthYearBS(yearBS: number, monthBS: number): string {
    const monthName = NEPALI_MONTH_NAMES[monthBS - 1] || '';
    return `${yearBS} ${monthName}`;
  }

  /**
   * Get all Nepali Month names
   */
  getNepaliMonths() {
    return NEPALI_MONTH_NAMES.map((name, index) => ({
      monthNumber: index + 1,
      name,
    }));
  }

  /**
   * Parses string BS dates like:
   * "2083 Bhadra 6", "2083-05-06", "2083/05/06", "2083-5-6"
   */
  parseBsDate(str?: string | null): { yearBS: number; monthBS: number; dayBS: number } | null {
    if (!str || typeof str !== 'string') return null;
    const trimmed = str.trim();

    // 1. ISO format: YYYY-MM-DD or YYYY/MM/DD
    const isoMatch = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    if (isoMatch) {
      const y = parseInt(isoMatch[1], 10);
      const m = parseInt(isoMatch[2], 10);
      const d = parseInt(isoMatch[3], 10);
      if (y >= 1900 && m >= 1 && m <= 12 && d >= 1 && d <= 32) {
        return { yearBS: y, monthBS: m, dayBS: d };
      }
    }

    // 2. Text format: "2083 Bhadra 6" or "2083 Ashadh 15"
    const monthAliases = [...NEPALI_MONTH_NAMES, 'Ashadh', 'Aswin'];
    for (let i = 0; i < monthAliases.length; i++) {
      const mName = monthAliases[i];
      if (new RegExp(`\\b${mName}\\b`, 'i').test(trimmed) || trimmed.toLowerCase().includes(mName.toLowerCase())) {
        const yearMatch = trimmed.match(/\b(20\d\d|19\d\d|21\d\d)\b/);
        const dayMatch = trimmed.replace(/\b(20\d\d|19\d\d|21\d\d)\b/, '').match(/\b(\d{1,2})\b/);
        if (yearMatch && dayMatch) {
          let monthNum = i + 1;
          if (mName.toLowerCase() === 'ashadh') monthNum = 3;
          if (mName.toLowerCase() === 'aswin') monthNum = 6;
          return {
            yearBS: parseInt(yearMatch[1], 10),
            monthBS: monthNum,
            dayBS: parseInt(dayMatch[1], 10),
          };
        }
      }
    }

    return null;
  }

  /**
   * Get days in a specific BS month
   */
  getDaysInMonth(yearBS: number, monthBS: number): number {
    return BS_MONTH_DAYS[yearBS]?.[monthBS - 1] ?? 30;
  }

  /**
   * Calculate exact billing period based on tenant move-in date
   */
  calculateBillingPeriod(moveInDateBS: string | null | undefined, yearBS: number, monthBS: number) {
    let day = 1;
    if (moveInDateBS) {
      const parsed = this.parseBsDate(moveInDateBS);
      if (parsed?.dayBS) {
        day = parsed.dayBS;
      }
    }

    const startMonthName = NEPALI_MONTH_NAMES[monthBS - 1] || 'Baisakh';
    const startMaxDays = this.getDaysInMonth(yearBS, monthBS);
    const startDay = Math.min(day, startMaxDays);
    const startDateBS = `${yearBS} ${startMonthName} ${startDay}`;

    // End date is next month on the same day
    let nextYearBS = yearBS;
    let nextMonthBS = monthBS + 1;
    if (nextMonthBS > 12) {
      nextMonthBS = 1;
      nextYearBS = yearBS + 1;
    }
    const endMonthName = NEPALI_MONTH_NAMES[nextMonthBS - 1] || 'Baisakh';
    const endMaxDays = this.getDaysInMonth(nextYearBS, nextMonthBS);
    const endDay = Math.min(day, endMaxDays);
    const endDateBS = `${nextYearBS} ${endMonthName} ${endDay}`;

    const billingPeriodBS = `${startDateBS} → ${endDateBS}`;

    // Check if period is ongoing
    const today = this.getCurrentNepaliDate();
    let isOngoing = false;
    if (today.yearBS < nextYearBS) {
      isOngoing = true;
    } else if (today.yearBS === nextYearBS) {
      if (today.monthBS < nextMonthBS) {
        isOngoing = true;
      } else if (today.monthBS === nextMonthBS && today.dayBS < endDay) {
        isOngoing = true;
      }
    }

    return {
      startDateBS,
      endDateBS,
      billingPeriodBS,
      isOngoing,
      startDay,
      endDay,
      startMonthName,
      endMonthName,
      nextYearBS,
      nextMonthBS,
    };
  }
}

