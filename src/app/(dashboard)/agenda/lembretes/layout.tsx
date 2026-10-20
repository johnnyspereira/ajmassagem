import type {ReactNode} from 'react';
import {metadataForRoute} from '@/lib/sharing/metadata';
export const metadata=metadataForRoute('/agenda/lembretes');
export default function ReminderLayout({children}:{children:ReactNode}){return children;}
