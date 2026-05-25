import { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native'
import { supabase } from '../../lib/supabase'

export default function LoginScreen() {
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSendOtp() {
    setLoading(true)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        data: {},
      }
    })
    if (error) Alert.alert('Error', error.message)
    else setSent(true)
    setLoading(false)
  }

  async function handleVerifyOtp() {
    setLoading(true)
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: 'email'
    })
    if (error) Alert.alert('Invalid code', 'Please check the code and try again.')
    setLoading(false)
  }

  if (sent) return (
    <View style={styles.container}>
      <Text style={styles.title}>DnD</Text>
      <Text style={styles.sub}>Enter the 6-digit code{'\n'}sent to {email}</Text>
      <TextInput
        style={styles.input}
        placeholder="000000"
        placeholderTextColor="#555"
        value={otp}
        onChangeText={setOtp}
        keyboardType="number-pad"
        maxLength={6}
        autoFocus
      />
      <TouchableOpacity style={styles.button} onPress={handleVerifyOtp} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? 'Verifying...' : 'Verify code'}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.resend} onPress={() => setSent(false)}>
        <Text style={styles.resendText}>Use a different email</Text>
      </TouchableOpacity>
    </View>
  )

  return (
    <View style={styles.container}>
      <Text style={styles.title}>DnD</Text>
      <Text style={styles.sub}>Enter your email to get a login code</Text>
      <TextInput
        style={styles.input}
        placeholder="your@email.com"
        placeholderTextColor="#555"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <TouchableOpacity style={styles.button} onPress={handleSendOtp} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? 'Sending...' : 'Send code'}</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 32, backgroundColor: '#0f0f0f' },
  title: { fontSize: 32, fontWeight: '700', color: '#fff', marginBottom: 12, textAlign: 'center' },
  sub: { color: '#888', textAlign: 'center', marginBottom: 32, lineHeight: 22 },
  input: { backgroundColor: '#1a1a1a', color: '#fff', borderRadius: 12, padding: 16, marginBottom: 16, fontSize: 16, borderWidth: 1, borderColor: '#333', textAlign: 'center' },
  button: { backgroundColor: '#e8a020', borderRadius: 12, padding: 16, alignItems: 'center' },
  buttonText: { color: '#000', fontWeight: '700', fontSize: 16 },
  resend: { marginTop: 20, alignItems: 'center' },
  resendText: { color: '#555', fontSize: 14 },
})