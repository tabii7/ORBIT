import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { ProfileService } from '../../profile/profile.service';
import { TravelPreferencesService } from '../../travel/travel-preferences.service';

/**
 * Shared tools so agents always load preferences from DB (never invent).
 */
export function createPreferenceTools(deps: {
  userId: string;
  profileService: ProfileService;
  travelPreferencesService: TravelPreferencesService;
}) {
  const { userId, profileService, travelPreferencesService } = deps;

  const getUserPreferences = tool(
    async () => {
      const [profilePrefs, travelPrefs] = await Promise.all([
        profileService.getPreferences(userId),
        travelPreferencesService.get(userId),
      ]);
      return JSON.stringify({
        ok: true,
        source: 'database',
        profilePreferences: profilePrefs.preferences,
        travelBookingPreferences: travelPrefs,
        instruction:
          'Report ONLY these DB values to the user. If arrays/fields are empty or null, say they have not saved that preference yet. NEVER invent preferences.',
      });
    },
    {
      name: 'get_user_preferences',
      description:
        'Load the user preferences from the database: profile categories (travel/food/language/finance) AND travel booking prefs (home city, budgets, cabin, airlines). ALWAYS call this when the user asks to show/tell/list their preferences. Never guess.',
      schema: z.object({}),
    },
  );

  return [getUserPreferences];
}
