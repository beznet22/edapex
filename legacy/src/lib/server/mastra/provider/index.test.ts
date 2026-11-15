import { describe, it, expect } from 'vitest';
import * as barrel from './index';

describe('provider barrel', () => {
	it('exports resolver functions', () => {
		expect(typeof barrel.resolveModelForRequest).toBe('function');
		expect(typeof barrel.pickDefaultModelId).toBe('function');
	});

	it('exports catalog helpers and constants', () => {
		expect(typeof barrel.getProviderById).toBe('function');
		expect(typeof barrel.getModelById).toBe('function');
		expect(typeof barrel.getModelsByProvider).toBe('function');
		expect(typeof barrel.getChatRoutableModels).toBe('function');
		expect(Array.isArray(barrel.POPULAR_PROVIDER_IDS)).toBe(true);
		expect(typeof barrel.PLATFORM_PROVIDERS).toBe('object');
		expect(typeof barrel.PLATFORM_MODELS).toBe('object');
	});

	it('exports credential helpers', () => {
		expect(typeof barrel.saveUserCredential).toBe('function');
		expect(typeof barrel.getUserCredential).toBe('function');
		expect(typeof barrel.getAllUserCredentials).toBe('function');
		expect(typeof barrel.deleteUserCredential).toBe('function');
		expect(typeof barrel.updateUserCredentialEnabled).toBe('function');
		expect(typeof barrel.rotateCredential).toBe('function');
		expect(typeof barrel.repairCorruptedCredential).toBe('function');
	});

	it('exports visibility helpers', () => {
		expect(typeof barrel.getHiddenModelIdsForUser).toBe('function');
		expect(typeof barrel.setModelVisibility).toBe('function');
		expect(typeof barrel.setAllModelVisibility).toBe('function');
	});

	it('exports availability helpers', () => {
		expect(typeof barrel.getAvailableModelsForUser).toBe('function');
	});
});
