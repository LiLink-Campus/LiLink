import { Global, Module } from '@nestjs/common';
import { SchoolResolverService } from './school-resolver.service';

@Global()
@Module({
  providers: [SchoolResolverService],
  exports: [SchoolResolverService],
})
export class SchoolModule {}
