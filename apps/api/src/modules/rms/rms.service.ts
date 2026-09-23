import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DomainException } from '../../common/http';
import { RMUser } from '../../database/entities';

@Injectable()
export class RmsService {
  constructor(@InjectRepository(RMUser) private readonly repository: Repository<RMUser>) {}

  list() {
    return this.repository.find({ order: { id: 'ASC' }, select: { id: true, name: true, branch: true, email: true } });
  }

  async assertExists(id: string) {
    if (!(await this.repository.existsBy({ id }))) {
      throw new DomainException(404, 'RM_NOT_FOUND', 'Relationship manager was not found.');
    }
  }

  findById(id: string) {
    return this.repository.findOneBy({ id });
  }
}

