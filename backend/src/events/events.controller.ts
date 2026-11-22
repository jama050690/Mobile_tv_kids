import { Controller, MessageEvent, Query, Sse } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { filter, interval, map, merge, Observable } from 'rxjs';
import { EventsService } from './events.service';

@ApiTags('Realtime')
@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  /**
   * Server-Sent Events oqimi. Jadval o'zgarsa ilova darhol "now" ni qayta so'raydi.
   * Hodisalar: schedule.updated, channel.updated, channels.changed, program.updated, ping
   */
  @Sse()
  @SkipThrottle()
  @ApiOperation({ summary: "Real-time hodisalar (SSE). channelId berilsa faqat o'sha kanal" })
  @ApiQuery({ name: 'channelId', required: false })
  stream(@Query('channelId') channelId?: string): Observable<MessageEvent> {
    const updates$ = this.events.stream$.pipe(
      filter((e) => !channelId || !e.channelId || e.channelId === channelId),
      map((e): MessageEvent => ({ type: e.type, data: e })),
    );
    // Proxy/mobil tarmoq ulanishni uzib qo'ymasligi uchun heartbeat
    const heartbeat$ = interval(25_000).pipe(
      map((): MessageEvent => ({ type: 'ping', data: { at: new Date().toISOString() } })),
    );
    return merge(updates$, heartbeat$);
  }
}
