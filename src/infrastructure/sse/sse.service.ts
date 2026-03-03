import { Injectable } from '@nestjs/common';
import { Subject, Observable } from 'rxjs';
import { map, filter } from 'rxjs/operators';

export interface SseEvent {
  type: string;
  data: any;
  timestamp: string;
}

@Injectable()
export class SseService {
  private events$ = new Subject<SseEvent>();

  emit(type: string, data: any): void {
    this.events$.next({
      type,
      data,
      timestamp: new Date().toISOString(),
    });
  }

  stream(eventTypes?: string[]): Observable<MessageEvent> {
    let source$ = this.events$.asObservable();
    if (eventTypes?.length) {
      source$ = source$.pipe(filter((e) => eventTypes.includes(e.type)));
    }
    return source$.pipe(
      map(
        (event) =>
          ({ data: JSON.stringify(event), type: event.type } as MessageEvent),
      ),
    );
  }
}
