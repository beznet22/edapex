import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$env/dynamic/private', () => ({
	env: {
		DATABASE_URL: 'mysql://test:test@localhost:3306/test',
		LIBSQL_URL: 'file:tests/.tmp/test.db',
		LIBSQL_AUTH_TOKEN: 'test',
		TOKEN_ENCRYPTION_KEY: 'test-encryption-key-32-chars-ok!',
		TINYFISH_API_KEY: 'test-key'
	}
}));

vi.mock('$env/dynamic/public', () => ({
	env: {
		PUBLIC_STORAGE_PATH: '/tmp/test-storage'
	}
}));

vi.mock('$app/server', () => ({
	getRequestEvent: () => null
}));

vi.mock('$app/environment', () => ({
	dev: true,
	browser: false
}));

vi.mock('$lib/components/template/ResultTemplate.svelte', () => ({
	default: {}
}));

vi.mock('$lib/components/template/result-email.svelte', () => ({
	default: {}
}));

import { createTenantContext } from '$lib/server/mastra/tenant-context';
import {
	listMasterDataLogic,
	type ListMasterDataInput
} from '$lib/server/mastra/tools/master-data-tools';

describe('listMasterDataLogic', () => {
	function makeToolContext(repoSpies: {
		StudentRepository?: Record<string, ReturnType<typeof vi.fn>>;
		StaffRepository?: Record<string, ReturnType<typeof vi.fn>>;
	}) {
		const tenantContext = createTenantContext({
			schoolId: 1,
			userId: 1,
			staffId: 1,
			designationId: 1,
			roleId: 1,
			classId: null,
			sectionId: null,
			examId: null,
			examTypeId: null,
			academicId: null,
			studentId: null
		});

		const getRepo = (RepoCls: { name?: string } | string) => {
			const name = (typeof RepoCls === 'string' ? RepoCls : RepoCls?.name) as
				| 'StudentRepository'
				| 'StaffRepository';
			const spy = repoSpies[name];
			if (!spy) {
				throw new Error(`Repository not stubbed in test: ${String(name)}`);
			}
			return spy;
		};

		return { tenantContext, getRepo };
	}

	it('returns student registration options', async () => {
		const studentRepo = {
			getStudentRegistrationOptions: vi.fn().mockResolvedValue({
				classes: [{ id: 1, name: 'Class 1' }],
				sections: [{ id: 1, name: 'A' }],
				categories: [
					{ id: 1, name: 'DAYCARE' },
					{ id: 2, name: 'NURSERY' }
				],
				genders: [
					{ id: 1, name: 'Male' },
					{ id: 2, name: 'Female' }
				],
				guardianRelations: [
					{ value: 'father', label: 'Father' },
					{ value: 'mother', label: 'Mother' }
				]
			})
		};

		const context = makeToolContext({ StudentRepository: studentRepo });
		const result = await listMasterDataLogic(context as never, {
			type: 'student-registration-options'
		} as ListMasterDataInput);

		expect(studentRepo.getStudentRegistrationOptions).toHaveBeenCalledTimes(1);
		expect(result).toEqual({
			categories: [
				{ id: 1, name: 'DAYCARE' },
				{ id: 2, name: 'NURSERY' }
			],
			genders: [
				{ id: 1, name: 'Male' },
				{ id: 2, name: 'Female' }
			],
			guardianRelations: [
				{ value: 'father', label: 'Father' },
				{ value: 'mother', label: 'Mother' }
			]
		});
	});

	it('returns staff registration options', async () => {
		const staffRepo = {
			getStaffRegistrationOptions: vi.fn().mockResolvedValue({
				designations: [{ id: 1, name: 'Principal' }],
				departments: [{ id: 2, name: 'Academics' }],
				genders: [
					{ id: 1, name: 'Male' },
					{ id: 2, name: 'Female' }
				],
				roles: [{ id: 1, name: 'Admin' }]
			})
		};

		const context = makeToolContext({ StaffRepository: staffRepo });
		const result = await listMasterDataLogic(context as never, {
			type: 'staff-registration-options'
		} as ListMasterDataInput);

		expect(staffRepo.getStaffRegistrationOptions).toHaveBeenCalledTimes(1);
		expect(result).toEqual({
			designations: [{ id: 1, name: 'Principal' }],
			departments: [{ id: 2, name: 'Academics' }],
			genders: [
				{ id: 1, name: 'Male' },
				{ id: 2, name: 'Female' }
			],
			roles: [{ id: 1, name: 'Admin' }]
		});
	});
});
