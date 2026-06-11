# 1. Lệnh push data từ local lên supabase 

```bash
python3 /home/mindx/MindX/MindX-OpsCoPilot/mindx-kguardian/scripts/seed.py

```

## 2. Lệnh tắt RLS trên Supabase

```bash
ALTER TABLE public.knowledge_base ENABLE ROW LEVEL SECURITY;


ALTER TABLE public.knowledge_base DISABLE ROW LEVEL SECURITY;

```

## 3. Script kiểm duyệt request đóng góp từ user

```bash
. ~/.nvm/nvm.sh
npx ts-node /home/mindx/MindX/MindX-OpsCoPilot/mindx-kguardian/scripts/moderate.ts

```
