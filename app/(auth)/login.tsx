import { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native'
import { supabase } from '../../lib/supabase'

export default function LoginScreen() {
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(false)
  const [isSignUp, setIsSignUp] = useState(false)

  async function handleAuth() {
    if (!identifier || !password) {
      Alert.alert('Error', 'Please fill in all fields')
      return
    }

    if (isSignUp && !username) {
      Alert.alert('Error', 'Please choose a username')
      return
    }

    setLoading(true)

    if (isSignUp) {
      // SIGN UP FLOW
      const { error } = await supabase.auth.signUp({
        email: identifier,
        password,
        options: {
          data: { username: username }
        }
      })
      if (error) Alert.alert('Sign Up Error', error.message)
      else Alert.alert('Success', 'Account created! You can now log in.')
    } else {
      // LOG IN FLOW
      let loginEmail = identifier

      if (!identifier.includes('@')) {
        const { data, error } = await supabase.rpc('get_email_by_username', { 
          p_username: identifier 
        })
        
        if (error || !data) {
          Alert.alert('Login Error', 'Username not found.')
          setLoading(false)
          return
        }
        loginEmail = data 
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password,
      })
      if (error) Alert.alert('Login Error', 'Incorrect credentials.')
    }

    setLoading(false)
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>DnD</Text>
      <Text style={styles.sub}>
        {isSignUp ? 'Create a new account' : 'Sign in to your account'}
      </Text>
      
      {isSignUp && (
        <TextInput
          style={styles.input}
          placeholder="Choose a Username"
          placeholderTextColor="#555"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
        />
      )}

      <TextInput
        style={styles.input}
        placeholder={isSignUp ? "Email address" : "Email or Username"}
        placeholderTextColor="#555"
        value={identifier}
        onChangeText={setIdentifier}
        keyboardType={isSignUp ? "email-address" : "default"}
        autoCapitalize="none"
      />
      
      <TextInput
        style={styles.input}
        placeholder="Password"
        placeholderTextColor="#555"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
      />

      <TouchableOpacity style={styles.button} onPress={handleAuth} disabled={loading}>
        <Text style={styles.buttonText}>
          {loading ? 'Processing...' : (isSignUp ? 'Sign Up' : 'Log In')}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.toggle} onPress={() => setIsSignUp(!isSignUp)}>
        <Text style={styles.toggleText}>
          {isSignUp ? 'Already have an account? Log in' : "Don't have an account? Sign up"}
        </Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 32, backgroundColor: '#0f0f0f' },
  title: { fontSize: 32, fontWeight: '700', color: '#fff', marginBottom: 12, textAlign: 'center' },
  sub: { color: '#888', textAlign: 'center', marginBottom: 32, lineHeight: 22 },
  input: { backgroundColor: '#1a1a1a', color: '#fff', borderRadius: 12, padding: 16, marginBottom: 16, fontSize: 16, borderWidth: 1, borderColor: '#333' },
  button: { backgroundColor: '#e8a020', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8 },
  buttonText: { color: '#000', fontWeight: '700', fontSize: 16 },
  toggle: { marginTop: 24, alignItems: 'center' },
  toggleText: { color: '#888', fontSize: 14 },
})