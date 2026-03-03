import { Global, Module } from '@nestjs/common';
import { EventStoreService } from './event-store.service';

@Global()
@Module({
  providers: [EventStoreService],
  exports: [EventStoreService],
})
export class EventStoreModule {}
