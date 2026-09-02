import { SetMetadata } from '@nestjs/common';

// Marks a route as not requiring authentication (used on the login endpoint).
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
