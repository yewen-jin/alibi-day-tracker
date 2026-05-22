-- Move existing users from the previous hosted fast-model default to the new
-- hosted default. Explicit custom choices are left untouched.

update user_ai_settings
   set fast_model = 'deepseek/deepseek-chat-v3',
       updated_at = now()
 where fast_model = 'openai/gpt-4.1-nano';

update user_ai_provider_settings
   set fast_model = 'deepseek/deepseek-chat-v3',
       updated_at = now()
 where fast_model = 'openai/gpt-4.1-nano';
