import { supabase } from './supabase'
import { DropResult } from '../types'

export async function openCase(collectionId: string, userId: string): Promise<DropResult> {
  const { data, error } = await supabase.functions.invoke('roll', {
    body: { collection_id: collectionId, user_id: userId },
  })
  if (error) throw error
  return data as DropResult
}