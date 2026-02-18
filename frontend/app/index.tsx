import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

export default function LoginScreen() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const [deviceId, setDeviceId] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [deviceName, setDeviceName] = useState('');

  useEffect(() => {
    checkExistingLogin();
  }, []);

  const checkExistingLogin = async () => {
    try {
      const savedDevice = await AsyncStorage.getItem('xow_device');
      if (savedDevice) {
        router.replace('/recorder');
      }
    } catch (error) {
      console.log('No existing login');
    }
  };

  const handleLogin = async () => {
    if (!deviceId.trim() || !password.trim()) {
      Alert.alert('Error', 'Enter Device ID and Password');
      return;
    }
    setIsLoading(true);
    try {
      const response = await axios.post(`${API_URL}/api/auth/login`, {
        device_id: deviceId.trim(),
        password: password.trim(),
      });
      if (response.data.success) {
        await AsyncStorage.setItem('xow_device', JSON.stringify(response.data.device));
        router.replace('/recorder');
      }
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!deviceId.trim() || !password.trim() || !deviceName.trim()) {
      Alert.alert('Error', 'Fill all fields');
      return;
    }
    setIsLoading(true);
    try {
      await axios.post(`${API_URL}/api/auth/register`, {
        device_id: deviceId.trim(),
        password: password.trim(),
        name: deviceName.trim(),
      });
      Alert.alert('Success', 'Device registered!');
      setIsRegistering(false);
      setDeviceName('');
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={[styles.container, { width, height }]}>
      <View style={styles.leftPanel}>
        <View style={styles.brand}>
          <View style={styles.logo}>
            <Ionicons name="videocam" size={28} color="#fff" />
          </View>
          <Text style={styles.brandName}>XoW</Text>
          <Text style={styles.tagline}>Booth Recording System</Text>
        </View>
        <View style={styles.features}>
          <View style={styles.feature}>
            <Ionicons name="recording" size={14} color="#E54B2A" />
            <Text style={styles.featureText}>HD Recording</Text>
          </View>
          <View style={styles.feature}>
            <Ionicons name="scan" size={14} color="#E54B2A" />
            <Text style={styles.featureText}>Visitor Tracking</Text>
          </View>
          <View style={styles.feature}>
            <Ionicons name="cloud" size={14} color="#E54B2A" />
            <Text style={styles.featureText}>Cloud Sync</Text>
          </View>
        </View>
      </View>

      <View style={styles.rightPanel}>
        <View style={styles.form}>
          <Text style={styles.formTitle}>{isRegistering ? 'Register' : 'Login'}</Text>
          
          <Text style={styles.label}>DEVICE ID</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter ID"
            placeholderTextColor="#444"
            value={deviceId}
            onChangeText={setDeviceId}
            autoCapitalize="none"
          />

          <Text style={styles.label}>PASSWORD</Text>
          <View style={styles.passwordRow}>
            <TextInput
              style={[styles.input, { flex: 1, marginBottom: 0 }]}
              placeholder="Enter password"
              placeholderTextColor="#444"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
              <Ionicons name={showPassword ? 'eye' : 'eye-off'} size={16} color="#666" />
            </TouchableOpacity>
          </View>

          {isRegistering && (
            <>
              <Text style={styles.label}>BOOTH NAME</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., Tech Booth A1"
                placeholderTextColor="#444"
                value={deviceName}
                onChangeText={setDeviceName}
              />
            </>
          )}

          <TouchableOpacity
            style={styles.submitBtn}
            onPress={isRegistering ? handleRegister : handleLogin}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.submitText}>{isRegistering ? 'Register' : 'Connect'}</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setIsRegistering(!isRegistering)}>
            <Text style={styles.switchText}>
              {isRegistering ? 'Back to Login' : 'Register New Device'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#000',
  },
  leftPanel: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: '#1a1a1a',
    padding: 20,
  },
  brand: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logo: {
    width: 50,
    height: 50,
    borderRadius: 12,
    backgroundColor: '#E54B2A',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  brandName: {
    fontSize: 32,
    fontWeight: '800',
    color: '#fff',
  },
  tagline: {
    fontSize: 11,
    color: '#666',
  },
  features: {
    gap: 8,
  },
  feature: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  featureText: {
    color: '#888',
    fontSize: 11,
  },
  rightPanel: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  form: {
    width: '100%',
    maxWidth: 280,
    backgroundColor: '#0a0a0a',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: '#1a1a1a',
  },
  formTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 16,
  },
  label: {
    fontSize: 9,
    fontWeight: '600',
    color: '#555',
    marginBottom: 4,
    marginTop: 8,
  },
  input: {
    backgroundColor: '#111',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: '#fff',
    fontSize: 13,
    borderWidth: 1,
    borderColor: '#222',
    marginBottom: 8,
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  eyeBtn: {
    padding: 8,
  },
  submitBtn: {
    backgroundColor: '#E54B2A',
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  submitText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  switchText: {
    color: '#E54B2A',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 12,
  },
});
