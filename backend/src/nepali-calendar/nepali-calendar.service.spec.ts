import { NepaliCalendarService } from './nepali-calendar.service';

describe('NepaliCalendarService', () => {
  let service: NepaliCalendarService;

  beforeEach(() => {
    service = new NepaliCalendarService();
  });

  it('should preserve standard numerals when formatting', () => {
    expect(service.toNepaliDigits(1250)).toBe('1250');
    expect(service.toNepaliDigits('Room 1: 6000')).toBe('Room 1: 6000');
    expect(service.toNepaliDigits(2083)).toBe('2083');
  });

  it('should return valid Bikram Sambat date format in English for current date', () => {
    const today = service.getCurrentNepaliDate();
    expect(today.yearBS).toBeGreaterThanOrEqual(2080);
    expect(today.monthBS).toBeGreaterThanOrEqual(1);
    expect(today.monthBS).toBeLessThanOrEqual(12);
    expect(today.monthNameBS).toBeDefined();
    expect(today.dayNameBS).toBeDefined();
    expect(today.nepaliFormatted).toMatch(/\d{4}\s+[A-Za-z]+\s+\d+/);
  });

  it('should format Month and Year in English BS correctly', () => {
    const formatted = service.formatMonthYearBS(2083, 5);
    expect(formatted).toBe('2083 Bhadra');
  });
});
