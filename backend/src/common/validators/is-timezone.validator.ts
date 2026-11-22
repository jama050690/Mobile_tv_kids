import { registerDecorator, ValidationOptions } from 'class-validator';
import { isValidTimezone } from '../utils/time.util';

/** IANA timezone (Asia/Tashkent, Europe/Moscow, America/New_York ...) */
export function IsTimezone(options?: ValidationOptions): PropertyDecorator {
  return (object: object, propertyName: string | symbol) => {
    registerDecorator({
      name: 'isTimezone',
      target: object.constructor,
      propertyName: propertyName as string,
      options: {
        message: `${String(propertyName)} to'g'ri IANA timezone bo'lishi kerak (masalan Asia/Tashkent)`,
        ...options,
      },
      validator: {
        validate: (value: unknown) => typeof value === 'string' && isValidTimezone(value),
      },
    });
  };
}
