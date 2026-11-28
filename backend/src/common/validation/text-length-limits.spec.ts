import { BadRequestException, ValidationPipe } from '@nestjs/common';
import type { Type } from '@nestjs/common';
import {
  COMMENT_BODY_MAX_LENGTH,
  CreateCommentDto,
} from '../../comments/dto/create-comment.dto';
import {
  CreateProjectDto,
  PROJECT_NAME_MAX_LENGTH,
} from '../../projects/dto/create-project.dto';
import {
  CreateTaskDto,
  TASK_DESCRIPTION_MAX_LENGTH,
  TASK_TITLE_MAX_LENGTH,
} from '../../tasks/dto/create-task.dto';
import { UpdateTaskDto } from '../../tasks/dto/update-task.dto';

// Same options as the global pipe in main.ts.
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

const PROJECT_ID = '3f0c7e7e-5d7a-4a43-9a6b-2f4b0f7b8c11';

async function validationErrors(
  metatype: Type<unknown>,
  body: Record<string, unknown>,
): Promise<string[]> {
  try {
    await pipe.transform(body, { type: 'body', metatype });
    return [];
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    const response = (error as BadRequestException).getResponse() as {
      message: string[];
    };
    return response.message;
  }
}

interface LimitCase {
  label: string;
  metatype: Type<unknown>;
  field: string;
  max: number;
  valid: Record<string, unknown>;
}

const cases: LimitCase[] = [
  {
    label: 'CreateTaskDto.title',
    metatype: CreateTaskDto,
    field: 'title',
    max: TASK_TITLE_MAX_LENGTH,
    valid: { title: 'Task', projectId: PROJECT_ID },
  },
  {
    label: 'CreateTaskDto.description',
    metatype: CreateTaskDto,
    field: 'description',
    max: TASK_DESCRIPTION_MAX_LENGTH,
    valid: { title: 'Task', projectId: PROJECT_ID },
  },
  {
    label: 'UpdateTaskDto.title',
    metatype: UpdateTaskDto,
    field: 'title',
    max: TASK_TITLE_MAX_LENGTH,
    valid: { version: 1 },
  },
  {
    label: 'UpdateTaskDto.description',
    metatype: UpdateTaskDto,
    field: 'description',
    max: TASK_DESCRIPTION_MAX_LENGTH,
    valid: { version: 1 },
  },
  {
    label: 'CreateProjectDto.name',
    metatype: CreateProjectDto,
    field: 'name',
    max: PROJECT_NAME_MAX_LENGTH,
    valid: { name: 'Project' },
  },
  {
    label: 'CreateCommentDto.body',
    metatype: CreateCommentDto,
    field: 'body',
    max: COMMENT_BODY_MAX_LENGTH,
    valid: { body: 'Comment' },
  },
];

describe('server-side text length limits', () => {
  it('uses the agreed limits', () => {
    expect(TASK_TITLE_MAX_LENGTH).toBe(200);
    expect(TASK_DESCRIPTION_MAX_LENGTH).toBe(10_000);
    expect(PROJECT_NAME_MAX_LENGTH).toBe(100);
    expect(COMMENT_BODY_MAX_LENGTH).toBe(5_000);
  });

  describe.each(cases)('$label', ({ metatype, field, max, valid }) => {
    it('accepts a value at the maximum length', async () => {
      await expect(
        validationErrors(metatype, { ...valid, [field]: 'a'.repeat(max) }),
      ).resolves.toEqual([]);
    });

    it('rejects a value one character over the maximum with a 400 field error', async () => {
      await expect(
        validationErrors(metatype, { ...valid, [field]: 'a'.repeat(max + 1) }),
      ).resolves.toEqual([
        `${field} must be shorter than or equal to ${max} characters`,
      ]);
    });
  });

  it('keeps existing minimum-length rules', async () => {
    await expect(
      validationErrors(CreateProjectDto, { name: 'a' }),
    ).resolves.toEqual(['Project name must be at least 2 characters long.']);
    await expect(
      validationErrors(CreateCommentDto, { body: '' }),
    ).resolves.toEqual(['Comment content cannot be empty.']);
  });

  it('keeps optional fields optional', async () => {
    await expect(
      validationErrors(CreateTaskDto, { title: 'Task', projectId: PROJECT_ID }),
    ).resolves.toEqual([]);
    await expect(
      validationErrors(UpdateTaskDto, { version: 1 }),
    ).resolves.toEqual([]);
  });
});
