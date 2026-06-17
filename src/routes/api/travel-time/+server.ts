import { json } from '@sveltejs/kit';
import { startTravelTime, isTravelTimeRunning, cancelTravelTime } from '$lib/travel-time.js';

export async function POST() {
	if (isTravelTimeRunning()) {
		return json({ message: 'Already running' }, { status: 409 });
	}
	startTravelTime();
	return json({ message: 'Started' }, { status: 202 });
}

export async function DELETE() {
	if (!isTravelTimeRunning()) {
		return json({ message: 'Not running' }, { status: 409 });
	}
	cancelTravelTime();
	return json({ message: 'Cancelled' });
}
