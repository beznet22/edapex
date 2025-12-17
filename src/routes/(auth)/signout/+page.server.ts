import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { auth } from '$lib/server/service/auth.service';

export const load: PageServerLoad = async ({ locals, cookies }) => {
	if (locals.session) {
		auth.logout();
	}

	redirect(307, '/signin');
}
